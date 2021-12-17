const fs = require("fs");
const xpath = require("xpath");
const { DOMParser } = require("xmldom");

const xml = fs.readFileSync("./cache/202001059349300920_public.xml").toString();
const doc = new DOMParser().parseFromString(xml, "text/xml");

const select = xpath.useNamespaces({ irs: "http://www.irs.gov/efile" });

console.log(
  select("/irs:Return/irs:ReturnHeader/irs:TaxPeriodEndDt", doc)[0].textContent
);
