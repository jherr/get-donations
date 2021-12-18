const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const yaml = require("js-yaml");

const { getFields, extractFields } = require("./lib/extractFields");
const getXMLData = require("./lib/getXMLData");

if (process.argv.length < 3) {
  console.log(`Usage: node getScheduleH.js <config.yml>`);
  process.exit(0);
}

(async function () {
  const config = yaml.load(fs.readFileSync(process.argv[2], "utf8"));

  let header = getFields();
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
  for (const ein of config.eins) {
    console.log(`Processing ${ein}`);
    const xmlReports = await getXMLData(ein, config.years);
    for (const year in xmlReports) {
      records.push(extractFields(xmlReports[year]));
    }
  }

  // Write out the reports
  await csvWriter.writeRecords(records);
})();
