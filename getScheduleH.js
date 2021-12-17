const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const yaml = require("js-yaml");

const DEBUG = false;

if (process.argv.length < 3) {
  console.log(`Usage: node getScheduleH.js <config.yml>`);
  process.exit(0);
}

const config = yaml.load(fs.readFileSync(process.argv[2], "utf8"));

/*
Valuable metadata resource about the fields:
https://github.com/jsfenfen/990-xml-metadata/blob/master/variables.csv
*/

// The lines within schedule H, part I, line 7 that we are interested in
const LINE_TITLES = {
  FinancialAssistanceAtCostTyp: "SchH_I_7_a_",
  UnreimbursedMedicaidGrp: "SchH_I_7_b_",
  TotalFinancialAssistanceTyp: "SchH_I_7_d_",
  CommunityHealthServicesGrp: "SchH_I_7_e_",
  HealthProfessionsEducationGrp: "SchH_I_7_f_",
  SubsidizedHealthServicesGrp: "SchH_I_7_g_",
  ResearchGrp: "SchH_I_7_h_",
  CashAndInKindContributionsGrp: "SchH_I_7_i_",
  TotalOtherBenefitsGrp: "SchH_I_7_j_",
  TotalCommunityBenefitsGrp: "SchH_I_7_k_",
};
const LINES = Object.keys(LINE_TITLES);

// The fields within each line that we want to extract
const FIELDS_TITLES = {
  TotalCommunityBenefitExpnsAmt: "c",
  DirectOffsettingRevenueAmt: "d",
  NetCommunityBenefitExpnsAmt: "e",
  TotalExpensePct: "f",
};
const FIELDS = Object.keys(FIELDS_TITLES);

// Any one off tag names within schedule H that we want to extract
const EXTRA_FIELDS_TEXT = {
  BadDebtExpenseReportedInd: "SchH_III_1",
  BadDebtExpenseAmt: "SchH_III_2",
  BadDebtExpenseAttributableAmt: "SchH_III_3",
  ReimbursedByMedicareAmt: "SchH_III_5",
  CostOfCareReimbursedByMedcrAmt: "SchH_III_6",
  MedicareSurplusOrShortfallAmt: "SchH_III_7",
};
const EXTRA_FIELDS = Object.keys(EXTRA_FIELDS_TEXT);

let header = [
  { id: "ein", title: "EIN" },
  { id: "businessName", title: "Business Name" },
  { id: "taxYear", title: "Tax Year" },
  { id: "taxEndDate", title: "Tax End Date" },
  { id: "returnTimeStamp", title: "Return Timestamp" },
  { id: "totalFunctionalExpenses", title: "990_IX_25_A" },
];
for (const line of LINES) {
  for (const field of FIELDS) {
    header.push({
      id: `${line}_${field}`,
      title: `${LINE_TITLES[line]}${FIELDS_TITLES[field]}`,
    });
  }
}
for (const id of EXTRA_FIELDS) {
  header.push({ id, title: EXTRA_FIELDS_TEXT[id] });
}

if (config.fields) {
  const regexes = config.fields.map((field) => new RegExp(field));
  header = header.filter((field) =>
    regexes.some((regex) => regex.test(field.title))
  );
}

const replacementValues = {
  minYear: Math.min(...config.years),
  maxYear: Math.max(...config.years),
  einCount: config.eins.length,
};

const path = config.output.replace(
  /(\{[^}]*\})/g,
  (_, p1) => replacementValues[p1.replace(/[{}]/g, "")]
);

const csvWriter = createCsvWriter({
  path,
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

  if (!einIndex[ein]) {
    console.log(`Index does not contain EIN ${ein}`);
  }

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
    const taxYr = doc.documentElement.getElementsByTagName("TaxYr");

    // Store the document by year (overwriting any previous documents for this year)
    if (taxYr[0]) {
      const taxYear = taxYr[0].textContent;
      if (config.years.includes(parseInt(taxYr[0].textContent, 10))) {
        reportsByYear[taxYear] = doc;
      } else {
        if (DEBUG) {
          console.log(
            `Ignoring ${fname} for year ${taxYear} becuse ${taxYear} is not in years from the configuration`
          );
        }
      }
    } else {
      if (DEBUG) {
        console.log(`Ignoring ${fname} because of a format change`);
      }
    }
  }

  return reportsByYear;
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

  for (const year in xmlReports) {
    const doc = xmlReports[year];
    const record = {};
    record.ein = ein;

    // Get the business name from the Filer
    const filer = doc.documentElement.getElementsByTagName("Filer")[0];
    record.businessName =
      filer.getElementsByTagName("BusinessNameLine1Txt")?.[0]?.textContent ??
      filer.getElementsByTagName("BusinessNameLine1")?.[0]?.textContent;

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
      const tag = scheduleH.getElementsByTagName(key);
      if (tag.length > 0) {
        record[key] = parseNumber(tag[0].textContent);
      } else {
        record[key] = "";
      }
    }

    records.push(record);
  }
}

(async function () {
  // Go throught the eins.txt file and run the report for each EIN
  for (const ein of config.eins) {
    console.log(`Processing ${ein}`);
    await runReport(ein);
  }

  // Write out the reports
  await csvWriter.writeRecords(records);
})();
