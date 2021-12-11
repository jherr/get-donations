const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");

// The lines within schedule H, part I, line 7 that we are interested in
const LINES = [
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
const FIELDS = [
  "TotalCommunityBenefitExpnsAmt",
  "DirectOffsettingRevenueAmt",
  "NetCommunityBenefitExpnsAmt",
  "TotalExpensePct",
];

// Setup the output arrays
const tsvReport = [];
const jsonReport = [];

// Setup the TSV header
const header = [
  "EIN",
  "Business Name",
  "Tax Year",
  "Tax End Date",
  "Total Functional Expenses",
];
for (const line of LINES) {
  for (const field of FIELDS) {
    header.push(`${line} ${field}`);
  }
}
tsvReport.push(header.join("\t"));

const EIN_INDEX_PATH = "./cache/index.json";

// Pre-compile an index of EINs to URLs if it doesn't exist
if (!fs.existsSync(EIN_INDEX_PATH)) {
  const index = {};
  for (const file of fs.readdirSync(`./indexes`)) {
    if (file.includes(".json")) {
      const json = JSON.parse(fs.readFileSync(`./indexes/${file}`));
      for (const k of Object.keys(json)) {
        for (const filing of json[k]) {
          index[filing.EIN] = index[filing.EIN] ?? [];
          index[filing.EIN].push(filing.URL);
        }
      }
    }
  }
  fs.writeFileSync(EIN_INDEX_PATH, JSON.stringify(index));
}

// Load the index of EINs to URLs
const einIndex = JSON.parse(fs.readFileSync(EIN_INDEX_PATH));

/**
 * Gets the XML data for the given EIN
 * @param {number} ein
 * @returns
 */
const getXMLData = async (ein) => {
  const reports = [];

  // Use the index to get the URLs for the EIN
  for (const url of einIndex[ein] ?? []) {
    // Create the filename by stripping the prefix off the data URL
    const fname = url.replace(/https:\/\/s3.amazonaws.com\/irs-form-990\//, "");

    // Check to see if we have it in the cache already, get it if not
    if (!fs.existsSync(`./cache/${fname}`)) {
      console.log(`Downloading ${url}`);
      const response = await fetch(url);
      const xml = await response.text();
      fs.writeFileSync(`./cache/${fname}`, xml);
    }

    // Read it from the cache
    const xml = fs.readFileSync(`./cache/${fname}`).toString();

    // Parse and store the XML document
    const xmlDoc = new DOMParser().parseFromString(xml, "text/xml");
    reports.push(xmlDoc);
  }

  return reports;
};

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

  for (const doc of xmlReports) {
    // Get the tax period end date
    const taxPeriodEndDate =
      doc.documentElement.getElementsByTagName("TaxPeriodEndDt")[0].textContent;

    // Get the tax year
    const taxYear =
      doc.documentElement.getElementsByTagName("TaxYr")[0].textContent;

    // Only process the report if we haven't already done this date for this EIN
    if (!handled[taxPeriodEndDate]) {
      handled[taxPeriodEndDate] = true;

      // Get the business name from the Filer
      const businessName = doc.documentElement
        .getElementsByTagName("Filer")[0]
        .getElementsByTagName("BusinessNameLine1Txt")[0].textContent;

      const cols = [];
      cols.push(ein);
      cols.push(businessName);
      cols.push(taxYear);
      cols.push(taxPeriodEndDate);

      // Get 990/PartIX/line 25/Col a
      const elTotalFunctionalExpensesGrp =
        doc.documentElement.getElementsByTagName(
          "TotalFunctionalExpensesGrp"
        )[0];
      const totalFunctionalExpensesAmt =
        elTotalFunctionalExpensesGrp?.getElementsByTagName("TotalAmt")?.[0]
          ?.textContent ?? "";
      cols.push(totalFunctionalExpensesAmt);

      // Set up the row for the JSON report
      const jsonObj = {
        ein,
        businessName,
        taxYear: parseInt(taxYear, 10),
        taxPeriodEndDate,
        totalFunctionalExpensesAmt: parseFloat(totalFunctionalExpensesAmt),
      };

      // Find the schedule H section
      const scheduleH =
        doc.documentElement.getElementsByTagName("IRS990ScheduleH")[0];

      // Loop through the lines and fields to grab the data
      for (const line of LINES) {
        const lineItem = scheduleH?.getElementsByTagName?.(line)?.[0];
        for (const field of FIELDS) {
          const fieldItem = lineItem?.getElementsByTagName?.(field)?.[0];
          if (lineItem && fieldItem) {
            cols.push(fieldItem.textContent);
            jsonObj[`${line}_${field}`] = parseFloat(fieldItem.textContent);
          } else {
            cols.push("");
          }
        }
      }

      for (const key of ["BadDebtExpenseAmt", "ReimbursedByMedicareAmt"]) {
        const value = scheduleH.getElementsByTagName(key)[0].textContent;
        jsonObj[key] = parseFloat(value);
      }

      tsvReport.push(cols.join("\t"));
      jsonReport.push(jsonObj);
    }
  }
}

(async function () {
  // Go throught the eins.txt file and run the report for each EIN
  const eins = fs
    .readFileSync("./eins.txt")
    .toString()
    .split("\n")
    .filter((s) => s.length > 0);
  for (const ein of eins) {
    console.log(`Processing ${ein}`);
    await runReport(parseInt(ein.trim()));
  }

  // Write out the reports
  fs.writeFileSync("./report.tsv", tsvReport.join("\n"));
  fs.writeFileSync("./report.json", JSON.stringify(jsonReport, null, 2));
})();
