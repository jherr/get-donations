const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const yaml = require("js-yaml");

const { getFields, extractFields } = require("./lib/extractFields");
const getXMLData = require("./lib/getXMLData");

const IGNORE = [
  "businessName",
  "ein",
  "returnTimeStamp",
  "taxEndDate",
  "taxYear",
];

(async function () {
  // Make sure we have a valid command line
  if (process.argv.length < 3) {
    console.log(`Usage: node getScheduleH.js <config.yml>`);
    process.exit(0);
  }

  // Read the report configuration file
  const config = yaml.load(fs.readFileSync(process.argv[2], "utf8"));

  // Get the list of EINs to process and the names of the businesses if specified
  const businessNames = {
    ...(config.einsWithNames ?? {}),
  };
  const einsToProcess = Array.from(
    new Set([...(config.eins ?? []), ...Object.keys(businessNames)])
  );

  // Get the header fields and trim them if the report configuration specifies fields
  let header = getFields();
  if (config.fields) {
    const regexes = config.fields.map((field) => new RegExp(field));
    header = header.filter((field) =>
      regexes.some((regex) => regex.test(field.title))
    );
  }

  // Create the CSV report path
  const replacementValues = {
    minYear: Math.min(...config.years),
    maxYear: Math.max(...config.years),
    einCount: einsToProcess.length,
  };
  const path = config.output.replace(
    /(\{[^}]*\})/g,
    (_, p1) => replacementValues[p1.replace(/[{}]/g, "")]
  );

  // Create the CSV writer
  const csvWriter = createCsvWriter({
    path,
    header,
  });

  // Iterate through all the EINs
  const records = [];
  const csvByEIN = {};
  const csvByYear = {};
  for (const einIndex in einsToProcess) {
    const ein = einsToProcess[einIndex];

    console.log(`Processing ${ein}`);

    const xmlReports = await getXMLData(ein, config.years);

    for (const year in xmlReports) {
      const out = extractFields(xmlReports[year]);

      if (!businessNames[ein]) {
        businessNames[ein] = out.businessName;
      }
      out.businessName = businessNames[ein] ?? out.businessName;

      records.push(out);

      for (field of Object.keys(out).filter((k) => !IGNORE.includes(k))) {
        if (!csvByEIN[field]) {
          csvByEIN[field] = einsToProcess.map((currentEIN) => ({
            ein: currentEIN,
            businessName: "",
          }));
        }
        csvByEIN[field][einIndex].businessName = businessNames[ein];
        csvByEIN[field][einIndex][year] = out[field];

        if (!csvByYear[field]) {
          csvByYear[field] = config.years.map((year) => ({
            year,
          }));
        }
        const yearIndex = config.years.indexOf(parseInt(year));
        csvByYear[field][yearIndex][ein] = out[field];
      }
    }
  }

  // Write out the report
  await csvWriter.writeRecords(records);

  if (config.csvDirectory) {
    if (!fs.existsSync(config.csvDirectory)) {
      fs.mkdirSync(config.csvDirectory);
    }

    for (const field in csvByEIN) {
      const einFields = [];
      for (const year of config.years) {
        einFields.push({ id: year, title: `${field}_${year}` });
      }
      einFields.push({ id: "ein", title: "EIN" });
      einFields.push({ id: "businessName", title: "Business Name" });

      const fieldWriter = createCsvWriter({
        path: `${config.csvDirectory}/${field}_byYear.csv`,
        header: einFields,
      });
      fieldWriter.writeRecords(csvByEIN[field]);
    }

    const yearFields = [];
    for (const ein of einsToProcess) {
      yearFields.push({ id: ein, title: businessNames[ein] });
    }
    yearFields.push({ id: "year", title: "Year" });
    for (const field in csvByYear) {
      const fieldWriter = createCsvWriter({
        path: `${config.csvDirectory}/${field}_byEIN.csv`,
        header: yearFields,
      });
      fieldWriter.writeRecords(csvByYear[field]);
    }
  }
})();
