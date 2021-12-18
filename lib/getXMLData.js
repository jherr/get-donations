const fs = require("fs");
const fetch = require("node-fetch");
const { DOMParser } = require("xmldom");

const { isValidFormat, getTaxYear } = require("./extractFields");
const einIndex = require("./einIndex");
const { DEBUG } = require("./constants");

/**
 * Gets the XML data for the given EIN
 * @param {number} ein - The EIN
 * @param {number} years - The years to get
 * @returns
 */
const getXMLData = async (ein, years) => {
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

    // Store the document by year (overwriting any previous documents for this year)
    if (isValidFormat(doc)) {
      const taxYear = getTaxYear(doc);
      if (years.includes(taxYear)) {
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

module.exports = getXMLData;
