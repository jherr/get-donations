const fs = require("fs");
const { extractFields, isValidFormat } = require("../lib/extractFields");
const { DOMParser } = require("xmldom");

const PROPUBLICA_DIR = "./propublica/xml";

const megaIndex = [];

const [, , year] = process.argv;

console.log(`Processing ${year}...`);

const files = fs
  .readdirSync(PROPUBLICA_DIR)
  .filter((f) => f.startsWith(year) && f.endsWith(".xml"));

let count = 0;
for (const f in files) {
  const file = files[f];
  if (f % 100 === 0) {
    console.log(`${f} of ${files.length}`);
  }
  try {
    const xml = fs.readFileSync(`${PROPUBLICA_DIR}/${file}`).toString();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (isValidFormat(doc)) {
      const data = extractFields(doc);
      if (data.SchH_I_7_k_e > 0) {
        megaIndex.push(data);
        count++;
      }
    } else {
      console.error(`Invalid format: ${file}`);
    }
  } catch (e) {
    console.error(`Error reading: ${file} : ${e}`);
  }
}

console.log(`Found ${count} out of ${files.length} files`);

fs.writeFileSync(
  `./mega-indexes/${year}-index.json`,
  JSON.stringify(megaIndex)
);
