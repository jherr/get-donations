const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// The lines within schedule H, part I, line 7 that we are interested in
const LINE_TITLES = {
  FinancialAssistanceAtCostTyp: "Financial Assistance at Cost",
  UnreimbursedMedicaidGrp: "Unreimbursed Medicaid",
  TotalFinancialAssistanceTyp: "Total Financial Assistance",
  CommunityHealthServicesGrp: "Community Health Services",
  HealthProfessionsEducationGrp: "Health Professions and Education",
  SubsidizedHealthServicesGrp: "Subsidized Health Services",
  ResearchGrp: "Research",
  CashAndInKindContributionsGrp: "Cash and In-Kind Contributions",
  TotalOtherBenefitsGrp: "Total Other Benefits",
  TotalCommunityBenefitsGrp: "Total Community Benefits",
  CommunitySupportGrp: "Community Support",
  TotalCommuntityBuildingActyGrp: "Total Community Building Activities",
};
const LINES = Object.keys(LINE_TITLES);

// The fields within each line that we want to extract
const FIELDS_TITLES = {
  TotalCommunityBenefitExpnsAmt: "Total Amount",
  DirectOffsettingRevenueAmt: "Direct Offsetting Revenue",
  NetCommunityBenefitExpnsAmt: "Net Benefit",
  TotalExpensePct: "Total Expense Percentage",
};
const FIELDS = Object.keys(FIELDS_TITLES);

// Any one off tag names within schedule H that we want to extract
const EXTRA_FIELDS_TEXT = {
  BadDebtExpenseAmt: "Bad Debt Expense Amount",
  ReimbursedByMedicareAmt: "Reimbursed By Medicare Amount",
};
const EXTRA_FIELDS = Object.keys(EXTRA_FIELDS_TEXT);

const header = [
  { id: "ein", title: "EIN" },
  { id: "businessName", title: "Business Name" },
  { id: "taxYear", title: "Tax Year" },
  { id: "taxEndDate", title: "Tax End Date" },
  { id: "returnTimeStamp", title: "Return Timestamp" },
  { id: "totalFunctionalExpenses", title: "Total Functional Expenses" },
];
for (const line of LINES) {
  for (const field of FIELDS) {
    header.push({
      id: `${line}_${field}`,
      title: `${LINE_TITLES[line]} ${FIELDS_TITLES[field]}`,
    });
  }
}
for (const id of EXTRA_FIELDS) {
  header.push({ id, title: EXTRA_FIELDS_TEXT[id] });
}

const csvWriter = createCsvWriter({
  path: "report.csv",
  header,
});
const records = [];

const EIN_INDEX_PATH = "./cache/indexByEIN.json";

// Remove the old index if it's there
if (fs.existsSync("./cache/index.json")) {
  fs.unlinkSync("./cache/index.json");
}

// Pre-compile an index of EINs to URLs if it doesn't exist
if (!fs.existsSync(EIN_INDEX_PATH)) {
  const index = {};
  for (const file of fs.readdirSync(`./indexes`)) {
    if (file.includes(".json")) {
      const json = JSON.parse(fs.readFileSync(`./indexes/${file}`));
      for (const k of Object.keys(json)) {
        for (const filing of json[k]) {
          index[filing.EIN] = index[filing.EIN] ?? [];
          index[filing.EIN].push(
            filing.URL.replace("https://s3.amazonaws.com/irs-form-990/", "")
          );
          index[filing.EIN].sort();
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
  // Create a lookup of year to tax document
  const reportsByYear = {};

  // Use the index to get the URLs for the EIN
  for (const fname of einIndex[ein] ?? []) {
    // Check to see if we have it in the cache already, get it if not
    if (!fs.existsSync(`./cache/${fname}`)) {
      const url = `https://s3.amazonaws.com/irs-form-990/${fname}`;

      console.log(`Downloading ${url}`);

      const response = await fetch(url);
      const xml = await response.text();

      fs.writeFileSync(`./cache/${fname}`, xml);
    }

    // Read it from the cache
    const xml = fs.readFileSync(`./cache/${fname}`).toString();

    // Parse and store the XML document
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    // Get the tax year
    const taxYear =
      doc.documentElement.getElementsByTagName("TaxYr")[0].textContent;

    // Store the document by year (overwriting any previous documents for this year)
    reportsByYear[taxYear] = doc;
  }

  return Object.values(reportsByYear);
};

/**
 * Parses to a float if value is a number, otherwise returns empty string
 * @param {strig} number as a string or an empty string
 * @returns
 */
const parseNumber = (value) => (value.length > 0 ? parseFloat(value) : "");

/**
 * Runs the report for a given EIN
 * @param {number} ein
 */
async function runReport(ein) {
  // Grab the XML data
  const xmlReports = await getXMLData(ein);

  for (const doc of xmlReports) {
    const record = {};
    record.ein = ein;

    // Get the business name from the Filer
    record.businessName = doc.documentElement
      .getElementsByTagName("Filer")[0]
      .getElementsByTagName("BusinessNameLine1Txt")[0].textContent;

    // Get the tax year
    record.taxYear =
      doc.documentElement.getElementsByTagName("TaxYr")[0].textContent;

    // Get the tax period end date
    record.taxEndDate =
      doc.documentElement.getElementsByTagName("TaxPeriodEndDt")[0].textContent;

    // Get the tax period end date
    record.returnTimeStamp =
      doc.documentElement.getElementsByTagName("ReturnTs")[0].textContent;

    // Get 990/PartIX/line 25/Col a
    const elTotalFunctionalExpensesGrp =
      doc.documentElement.getElementsByTagName("TotalFunctionalExpensesGrp")[0];
    record.totalFunctionalExpenses = parseNumber(
      elTotalFunctionalExpensesGrp?.getElementsByTagName("TotalAmt")?.[0]
        ?.textContent ?? ""
    );

    // Find the schedule H section
    const scheduleH =
      doc.documentElement.getElementsByTagName("IRS990ScheduleH")[0];

    // Loop through the lines and fields to grab the data
    for (const line of LINES) {
      const lineItem = scheduleH?.getElementsByTagName?.(line)?.[0];
      for (const field of FIELDS) {
        const fieldItem = lineItem?.getElementsByTagName?.(field)?.[0];
        record[`${line}_${field}`] = parseNumber(fieldItem?.textContent ?? "");
      }
    }

    // Get any extra fields from schedule H
    for (const key of EXTRA_FIELDS) {
      const value = scheduleH.getElementsByTagName(key)[0].textContent;
      record[key] = parseNumber(value);
    }

    records.push(record);
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
  await csvWriter.writeRecords(records);
})();
