const xpath = require("xpath");

/*
Valuable metadata resource about the fields:
https://github.com/jsfenfen/990-xml-metadata/blob/master/variables.csv
*/

// The lines within schedule H, part I, line 7 that we are interested in
const PART_I_LINES = {
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

// The fields within each line that we want to extract
const PART_I_FIELDS = {
  TotalCommunityBenefitExpnsAmt: "c",
  DirectOffsettingRevenueAmt: "d",
  NetCommunityBenefitExpnsAmt: "e",
  TotalExpensePct: "f",
};

const PART_II_LINES = {
  PhysicalImprvAndHousingGrp: "SchH_II_1_",
  EconomicDevelopmentGrp: "SchH_II_2_",
  CommunitySupportGrp: "SchH_II_3_",
  EnvironmentalImprovementsGrp: "SchH_II_4_",
  LeadershipDevelopmentGrp: "SchH_II_5_",
  CoalitionBuildingGrp: "SchH_II_6_",
  HealthImprovementAdvocacyGrp: "SchH_II_7_",
  WorkforceDevelopmentGrp: "SchH_II_8_",
  OtherCommuntityBuildingActyGrp: "SchH_II_9_",
  TotalCommuntityBuildingActyGrp: "SchH_II_10_",
};

const PART_II_FIELDS = {
  ActivitiesOrProgramsCnt: "a",
  PersonsServedCnt: "b",
  TotalCommunityBenefitExpnsAmt: "c",
  DirectOffsettingRevenueAmt: "d",
  NetCommunityBenefitExpnsAmt: "e",
  TotalExpensePct: "f",
};

// Any one off tag names within schedule H that we want to extract
const EXTRA_FIELDS = {
  BadDebtExpenseAmt: "SchH_III_2",
  BadDebtExpenseAttributableAmt: "SchH_III_3",
  ReimbursedByMedicareAmt: "SchH_III_5",
  CostOfCareReimbursedByMedcrAmt: "SchH_III_6",
  MedicareSurplusOrShortfallAmt: "SchH_III_7",
};

/**
 * Returns all the potential fields
 * @returns {array} The potential fields
 */
function getFields() {
  const header = [
    { id: "ein", title: "EIN" },
    { id: "businessName", title: "Business Name" },
    { id: "preparerName", title: "Preparer Name" },
    { id: "taxYear", title: "Tax Year" },
    { id: "taxEndDate", title: "Tax End Date" },
    { id: "returnTimeStamp", title: "Return Timestamp" },
    { id: "zipCode", title: "ZIP Code" },
    { id: "state", title: "State" },
    { id: "Sch990_IX_25_A", title: "Sch990_IX_25_A" },
    { id: "Sch990_IX_7_A", title: "Sch990_IX_7_A" },
  ];

  for (const line in PART_I_LINES) {
    for (const field in PART_I_FIELDS) {
      const id = `${PART_I_LINES[line]}${PART_I_FIELDS[field]}`;
      header.push({
        id,
        title: id,
      });
    }
  }

  for (const line in PART_II_LINES) {
    for (const field in PART_II_FIELDS) {
      const id = `${PART_II_LINES[line]}${PART_II_FIELDS[field]}`;
      header.push({
        id,
        title: id,
      });
    }
  }

  for (const id in EXTRA_FIELDS) {
    header.push({ id: EXTRA_FIELDS[id], title: EXTRA_FIELDS[id] });
  }
  return header;
}

// Create the xpath selector
const select = xpath.useNamespaces({ irs: "http://www.irs.gov/efile" });

/**
 * Parses to a float if value is a number, otherwise returns empty string
 * @param {strig} number as a string or an empty string
 * @returns
 */
const parseNumber = (value) => (value.length > 0 ? parseFloat(value) : "");

/**
 * Checks whether the XML document is in format we can handle
 * @param {XMLDocument} doc - The XML document
 * @returns True if this XML document is in a format we recognise
 */
function isValidFormat(doc) {
  return select("//irs:TaxYr", doc).length > 0;
}

/**
 * Gets the IRS tax year
 * @param {XMLDocument} doc - The XML document
 * @returns The tax year
 */
function getTaxYear(doc) {
  return parseInt(select("//irs:TaxYr", doc)[0].textContent, 10);
}

/**
 * Extracts the fields from the document
 * @param {XMLDocument} doc - The XML document to parse
 */
function extractFields(doc) {
  const record = {};

  record.ein = select("//irs:Filer/irs:EIN", doc)[0].textContent;

  // Get the business name from the Filer
  record.preparerName = "";
  if (select("//irs:PreparerFirmName", doc)?.[0]) {
    record.preparerName =
      select("//irs:PreparerFirmName/irs:BusinessNameLine1Txt", doc)?.[0]
        ?.textContent ??
      select("//irs:PreparerFirmName/irs:BusinessNameLine1")?.[0]
        ?.textContent ??
      "";
  }
  // Get the business name from the Filer
  record.businessName =
    select("//irs:Filer/irs:BusinessName/irs:BusinessNameLine1Txt", doc)?.[0]
      ?.textContent ??
    select("//irs:Filer/irs:BusinessName/irs:BusinessNameLine1")?.[0]
      ?.textContent;
  record.state =
    select("//irs:IRS990/irs:USAddress/irs:StateAbbreviationCd", doc)?.[0]
      ?.textContent ?? "";
  record.zipCode =
    select("//irs:IRS990/irs:USAddress/irs:ZIPCd", doc)?.[0]?.textContent ?? "";

  // Get the tax year
  record.taxYear = getTaxYear(doc);

  // Get the tax period end date
  record.taxEndDate = select("//irs:TaxPeriodEndDt", doc)[0].textContent;

  // Get the tax period end date
  record.returnTimeStamp = select("//irs:ReturnTs", doc)[0].textContent;

  // Get 990/PartIX/line 25/Col a
  record["Sch990_IX_25_A"] = parseNumber(
    select("//irs:TotalFunctionalExpensesGrp/irs:TotalAmt", doc)?.[0]
      ?.textContent ?? ""
  );

  record["Sch990_IX_7_A"] = parseNumber(
    select("//irs:OtherSalariesAndWagesGrp/irs:TotalAmt", doc)?.[0]
      ?.textContent ?? ""
  );

  // Loop through the lines and fields to grab the data
  for (const line in PART_I_LINES) {
    for (const field in PART_I_FIELDS) {
      const path = `//irs:IRS990ScheduleH/irs:${line}/irs:${field}`;
      const fieldItem = select(path, doc)?.[0];
      record[`${PART_I_LINES[line]}${PART_I_FIELDS[field]}`] = parseNumber(
        fieldItem?.textContent ?? ""
      );
    }
  }

  for (const line in PART_II_LINES) {
    for (const field in PART_II_FIELDS) {
      const path = `//irs:IRS990ScheduleH/irs:${line}/irs:${field}`;
      const fieldItem = select(path, doc)?.[0];
      record[`${PART_II_LINES[line]}${PART_II_FIELDS[field]}`] = parseNumber(
        fieldItem?.textContent ?? ""
      );
    }
  }

  // Get any extra fields from schedule H
  for (const key in EXTRA_FIELDS) {
    const tag = select(`//irs:IRS990ScheduleH/irs:${key}`, doc);
    if (tag.length > 0) {
      record[EXTRA_FIELDS[key]] = parseNumber(tag[0].textContent);
    } else {
      record[EXTRA_FIELDS[key]] = "";
    }
  }

  record.freeText = [];

  const path = `//irs:IRS990ScheduleH//irs:SupplementalInformationDetail`;
  for (const tag of select(path, doc)) {
    const formLine = select("irs:FormAndLineReferenceDesc", tag)?.[0]
      ?.textContent;
    const explanationText = select("irs:ExplanationTxt", tag)?.[0]?.textContent;
    record.freeText.push({
      formLine,
      explanationText,
    });
  }

  return record;
}

module.exports = {
  getFields,
  extractFields,
  isValidFormat,
  getTaxYear,
};
