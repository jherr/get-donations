const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");

// The lines within schedule H that we are interested in
const lines = [
  "FinancialAssistanceAtCostTyp",
  "UnreimbursedMedicaidGrp",
  "TotalFinancialAssistanceTyp",
  "CommunityHealthServicesGrp",
  "HealthProfessionsEducationGrp",
  "SubsidizedHealthServicesGrp",
  "ResearchGrp",
  "CashAndInKindContributionsGrp",
  "TotalOtherBenefitsGrp",
  "TotalCommunityBenefitsGrp",
  "CommunitySupportGrp",
  "TotalCommuntityBuildingActyGrp",
];

// The fields within each line that we want to extract
const fields = [
  "TotalCommunityBenefitExpnsAmt",
  "DirectOffsettingRevenueAmt",
  "NetCommunityBenefitExpnsAmt",
  "TotalExpensePct",
];

/**
 * Gets the XML data for the given EIN
 * @param {number} ein
 * @returns
 */
const getXMLData = async (ein) => {
  const reports = [];

  // Scan the indexes directoy
  for (const file of fs.readdirSync(`./indexes`)) {
    if (file.includes(".json")) {
      // Read each index file
      const json = JSON.parse(fs.readFileSync(`./indexes/${file}`));

      for (const k of Object.keys(json)) {
        for (const filing of json[k]) {
          // Look for the EIN
          if (parseInt(filing.EIN) === ein) {
            // Create the filename by stripping the prefix off the data URL
            const fname = filing.URL.replace(
              /https:\/\/s3.amazonaws.com\/irs-form-990\//,
              ""
            );

            // Check to see if we have it in the cache already, get it if not
            if (!fs.existsSync(`./cache/${fname}`)) {
              console.log(`Downloading ${filing.URL}`);
              const response = await fetch(filing.URL);
              const xml = await response.text();
              fs.writeFileSync(`./cache/${fname}`, xml);
            }

            // Read it from the cache
            reports.push(fs.readFileSync(`./cache/${fname}`).toString());
          }
        }
      }
    }
  }
  return reports;
};

// Setup the output arrays
const tsvReport = [];
const jsonReport = [];

/**
 * Runs the report for a given EIN
 * @param {number} ein
 */
async function runReport(ein) {
  // Grab the XML data
  const xmlReports = await getXMLData(ein);

  // Keep an array of reports we've already processed since there
  // are duplicates
  const handled = {};

  for (const xml of xmlReports) {
    // Parse the XML document
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    // Get the tax period end date
    const taxPeriodEndDate =
      doc.documentElement.getElementsByTagName("TaxPeriodEndDt")[0].textContent;

    // Only process the report if we haven't already done this date for this EIN
    if (!handled[taxPeriodEndDate]) {
      handled[taxPeriodEndDate] = true;

      // Get the business name from the Filer
      const businessName = doc.documentElement
        .getElementsByTagName("Filer")
        .item(0)
        .getElementsByTagName("BusinessNameLine1Txt")
        .item(0).textContent;

      const cols = [];
      cols.push(ein);
      cols.push(businessName);
      cols.push(taxPeriodEndDate);

      // Get 990/PartIX/line 25/Col a
      const elTotalFunctionalExpensesGrp = doc.documentElement
        .getElementsByTagName("TotalFunctionalExpensesGrp")
        .item(0);
      const totalFunctionalExpensesAmt =
        elTotalFunctionalExpensesGrp?.getElementsByTagName("TotalAmt")?.item(0)
          ?.textContent ?? "";
      cols.push(totalFunctionalExpensesAmt);

      const jsonObj = {
        ein,
        businessName,
        taxPeriodEndDate,
        totalFunctionalExpensesAmt: parseFloat(totalFunctionalExpensesAmt),
      };

      // Find the schedule H section
      const scheduleH = doc.documentElement
        .getElementsByTagName("IRS990ScheduleH")
        .item(0);

      // Loop through the lines and fields to grab the data
      for (const line of lines) {
        const lineItem = scheduleH?.getElementsByTagName?.(line)?.item(0);
        for (const field of fields) {
          const fieldItem = lineItem?.getElementsByTagName?.(field)?.item(0);
          if (lineItem && fieldItem) {
            cols.push(fieldItem.textContent);
            jsonObj[`${line}_${field}`] = parseFloat(fieldItem.textContent);
          } else {
            cols.push("");
          }
        }
      }

      tsvReport.push(cols.join("\t"));
      jsonReport.push(jsonObj);
    }
  }
}

(async function () {
  // Setup the TSV header
  const header = [
    "EIN",
    "Business Name",
    "Tax End Date",
    "Total Functional Expenses",
  ];
  for (const line of lines) {
    for (const field of fields) {
      header.push(`${line} ${field}`);
    }
  }
  tsvReport.push(header.join("\t"));

  // Go throught the eins.txt file and run the report for each EIN
  const eins = fs
    .readFileSync("./eins.txt")
    .toString()
    .split("\n")
    .filter((s) => s.length);
  for (const ein of eins) {
    console.log(`Processing ${ein}`);
    await runReport(parseInt(ein.trim()));
  }

  // Write out the reports
  fs.writeFileSync("./report.tsv", tsvReport.join("\n"));
  fs.writeFileSync("./report.json", JSON.stringify(jsonReport, null, 2));
})();
