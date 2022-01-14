const fs = require("fs");
const { extractFields, isValidFormat } = require("../lib/extractFields");
const { DOMParser } = require("xmldom");

const megaIndex = [];

const [, , year] = process.argv;

console.log(`Processing ${year}...`);

const files = fs
  .readFileSync("./scheduleh-sorted.txt")
  .toString()
  .split("\n")
  .filter((line) => line.includes(`download990xml_${year}`));

let count = 0;
for (const f in files) {
  const file = files[f];
  if (f % 100 === 0) {
    console.log(`${f} of ${files.length}`);
  }
  try {
    const xml = fs.readFileSync(file).toString();
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

fs.writeFileSync(`./${year}-index.json`, JSON.stringify(megaIndex));
