const fs = require("fs");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const yaml = require("js-yaml");

const { getFields } = require("./lib/extractFields");

const IGNORE = [
  "businessName",
  "ein",
  "returnTimeStamp",
  "taxEndDate",
  "taxYear",
  "freeText",
];

const megaIndexes = {};
for (file of fs.readdirSync("./mega-indexes").sort()) {
  for (const row of JSON.parse(fs.readFileSync(`./mega-indexes/${file}`))) {
    megaIndexes[row.ein] = megaIndexes[row.ein] ?? {};
    megaIndexes[row.ein][row.taxYear] = row;
  }
}

(async function () {
  // Make sure we have a valid command line
  if (process.argv.length < 3) {
    console.log(`Usage: node getScheduleH.js <config.yml>`);
    process.exit(0);
  }

  // Read the report configuration file
  const config = yaml.load(fs.readFileSync(process.argv[2], "utf8"));

  // Parse up the filters
  const filters = [];
  const configFilters = config.filters || {};
  if (configFilters.minimumYears) {
    filters.push((rows) =>
      rows.length > configFilters.minimumYears ? rows : []
    );
  }
  if (configFilters.fieldValue) {
    for (const filterDef of configFilters.fieldValue) {
      if (filterDef.operator === "includes") {
        const lcValue = filterDef.value.toLowerCase();
        filters.push((rows) =>
          rows.filter((row) =>
            row[filterDef.name].toLowerCase().includes(lcValue)
          )
        );
      } else if (filterDef.operator === "gt") {
        const value = parseFloat(filterDef.value);
        filters.push((rows) =>
          rows.filter((row) => row[filterDef.name] > value)
        );
      } else if (filterDef.operator === "lt") {
        const value = parseFloat(filterDef.value);
        filters.push((rows) =>
          rows.filter((row) => row[filterDef.name] < value)
        );
      } else {
        filters.push((rows) =>
          rows.filter((row) => row[filterDef.name] === filterDef.value)
        );
      }
    }
  }

  // Get the list of eins to process
  const configEins = [];
  for (const ein of config.eins ?? []) {
    if (ein.includes("list:")) {
      const [, listName] = ein.split(":");
      const listEins = yaml.load(
        fs.readFileSync(`./lists/${listName}.yml`, "utf8")
      );
      for (const listEin of Object.keys(listEins)) {
        configEins.push(listEin);
      }
    } else {
      configEins.push(ein);
    }
  }

  // Get the list of EINs to process and the names of the businesses if specified
  const businessNames = {
    ...(config.einsWithNames ?? {}),
  };
  const einsToProcess = Array.from(
    new Set([...(configEins ?? []), ...Object.keys(businessNames)])
  );

  // Get the header fields and trim them if the report configuration specifies fields
  let header = getFields();
  const freeTextFields = [];
  if (config.fields) {
    const regexes = [];
    for (const field of config.fields) {
      if (field.includes("freeText")) {
        const [_, headerName, ...filters] = field.split(":");
        freeTextFields.push({
          headerName,
          filters: filters.map((f) => f.toLowerCase()),
        });
      } else {
        regexes.push(new RegExp(field));
      }
    }
    header = header.filter((field) =>
      regexes.some((regex) => regex.test(field.title))
    );
    for (const field of freeTextFields) {
      header.push({
        title: field.headerName,
        id: field.headerName,
      });
    }
  }
  console.log(header);

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
  const processedEins = new Set();
  for (const einIndex in einsToProcess) {
    const ein = einsToProcess[einIndex];

    const foundRecords = Object.values(megaIndexes[ein] || {});

    let rows = Object.values(foundRecords);
    for (const filter of filters) {
      rows = filter(rows);
    }

    if (rows.length) {
      // console.log(`Processing ${ein}: ${rows.length} records`);
    }

    for (const out of rows) {
      processedEins.add(out.ein);

      const year = out.taxYear;

      if (!businessNames[ein]) {
        businessNames[ein] = out.businessName;
      }
      out.businessName = businessNames[ein] ?? out.businessName;

      for (const field of freeTextFields) {
        const name = field.headerName;
        const filters = field.filters;
        for (const ft of out.freeText) {
          const formLine = ft.formLine.toLowerCase();
          if (filters.every((filter) => formLine.includes(filter))) {
            out[name] = ft.explanationText;
          }
        }
      }

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
        if (!csvByYear[field][yearIndex]) {
          csvByYear[field][yearIndex] = {};
        }
        csvByYear[field][yearIndex][ein] = out[field];
      }
    }
  }

  console.log(`Processed ${Array.from(processedEins).length} EINs`);

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
