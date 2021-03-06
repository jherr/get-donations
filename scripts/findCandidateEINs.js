/*
This script finds all potential EINs that are comporable to the EINs in the
eins.txt file.
*/
const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");

const operatesHospitals = fs
  .readFileSync("./operates-hospital-2018.txt")
  .toString()
  .split("\n")
  .filter((t) => t.length);

// Get the 2019, 2020, and 2021 indexes
const einIndex2018 = JSON.parse(
  fs.readFileSync("../indexes/index_2018.json").toString()
).Filings2018;
const einIndex2019 = JSON.parse(
  fs.readFileSync("../indexes/index_2019.json").toString()
).Filings2019;
const einIndex2020 = JSON.parse(
  fs.readFileSync("../indexes/index_2020.json").toString()
).Filings2020;
const einIndex2021 = JSON.parse(
  fs.readFileSync("../indexes/index_2021.json").toString()
).Filings2021;

// Create a lookup from EIN to name
const urlNameLookup = [einIndex2018, einIndex2021, einIndex2020, einIndex2019]
  .flat()
  .reduce((lookup, { EIN, OrganizationName, URL }) => {
    lookup[EIN] = {
      URL,
      OrganizationName,
    };
    return lookup;
  }, {});

// Get the current EIN Lookup file
const einLookup = JSON.parse(fs.readFileSync("./einLookup.json").toString());

(async () => {
  // Go through the target index and find all the 990s where
  // the organization name is interesting to us
  const eins = operatesHospitals.filter((ein) => !einLookup[ein]);

  // Go through the candidate EINs by index
  for (const index in eins) {
    const EIN = eins[index];
    const nonProfit = urlNameLookup[EIN];

    if (!nonProfit) {
      console.log(`No non-profit found for ${EIN}`);
    }

    // See if we have checked this already
    if (nonProfit && einLookup[EIN] === undefined) {
      console.log(
        `${index} of ${eins.length}: ${EIN} : ${nonProfit.OrganizationName}`
      );

      // Get the XML and convert it into a DOM
      const req = await fetch(nonProfit.URL);
      const xml = await req.text();
      const doc = new DOMParser().parseFromString(xml, "text/xml");

      // Get the schedule H
      const scheduleH =
        doc.documentElement.getElementsByTagName("IRS990ScheduleH")[0];
      if (scheduleH) {
        // If we have one get the total functional expenses
        const elTotalFunctionalExpensesGrp =
          doc.documentElement.getElementsByTagName(
            "TotalFunctionalExpensesGrp"
          )[0];
        const totalFunctionalExpenses = parseFloat(
          elTotalFunctionalExpensesGrp?.getElementsByTagName("TotalAmt")?.[0]
            ?.textContent ?? ""
        );

        // Get the name of the filer
        const name = doc.documentElement
          .getElementsByTagName("Filer")[0]
          .getElementsByTagName("BusinessNameLine1Txt")[0].textContent;

        // Format the data and add it to the lookup
        const data = {
          EIN,
          totalFunctionalExpenses,
          name,
        };
        console.log(JSON.stringify(data));

        einLookup[EIN] = data;
      } else {
        // Add a null to the lookup indicating that we checked the 990 but
        // didn't find a schedule H
        einLookup[EIN] = null;
      }

      // Update the lookup file so that if we crash we don't have to check again
      fs.writeFileSync("./einLookup.json", JSON.stringify(einLookup, null, 2));
    }
  }

  // Create the TSV file for the candidate EINs (the ones with data)
  const candidates = Object.entries(einLookup)
    .filter(([_, data]) => data)
    .map(([ein, data]) =>
      [ein, data.name, data.totalFunctionalExpenses].join("\t")
    );
  fs.writeFileSync(
    "candidates.tsv",
    `EIN\tName\tTotalFunctionalExpenses\n${candidates.join("\n")}`
  );

  // Create the TSV file for the EINs that we checked but didn't find a schedule H
  const checked = Object.entries(einLookup)
    .filter(([_, data]) => data === null)
    .map(([ein]) => [ein, urlNameLookup[ein].OrganizationName].join("\t"));
  fs.writeFileSync("checked.tsv", `EIN\tName\n${checked.join("\n")}`);
})();
