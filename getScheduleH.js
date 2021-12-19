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
    einCount: config.eins.length,
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
  const csvFiles = {};
  for (const einIndex in config.eins) {
    const ein = config.eins[einIndex];

    console.log(`Processing ${ein}`);

    const xmlReports = await getXMLData(ein, config.years);

    for (const year in xmlReports) {
      const out = extractFields(xmlReports[year]);
      records.push(out);

      for (field of Object.keys(out).filter((k) => !IGNORE.includes(k))) {
        if (!csvFiles[field]) {
          csvFiles[field] = config.eins.map((currentEIN) => ({
            ein: currentEIN,
            businessName: "",
          }));
        }
        csvFiles[field][einIndex].businessName = out.businessName;
        csvFiles[field][einIndex][year] = out[field];
      }
    }
  }

  // Write out the report
  await csvWriter.writeRecords(records);

  if (config.csvDirectory) {
    if (!fs.existsSync(config.csvDirectory)) {
      fs.mkdirSync(config.csvDirectory);
    }

    const fieldHeader = [
      { id: "ein", title: "EIN" },
      { id: "businessName", title: "Business Name" },
    ];
    for (const year of config.years) {
      fieldHeader.push({ id: year, title: year });
    }

    for (const field in csvFiles) {
      const fieldWriter = createCsvWriter({
        path: `${config.csvDirectory}/${field}.csv`,
        header: fieldHeader,
      });
      fieldWriter.writeRecords(csvFiles[field]);
    }
  }
})();
