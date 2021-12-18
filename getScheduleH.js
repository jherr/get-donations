const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const yaml = require("js-yaml");

const { getFields, extractFields } = require("./lib/extractFields");
const getXMLData = require("./lib/getXMLData");

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
  for (const ein of config.eins) {
    console.log(`Processing ${ein}`);

    const xmlReports = await getXMLData(ein, config.years);

    for (const year in xmlReports) {
      records.push(extractFields(xmlReports[year]));
    }
  }

  // Write out the report
  await csvWriter.writeRecords(records);
})();
