const fs = require("fs");

const EIN_INDEX_PATH = "./cache/indexByEIN.json";

// Pre-compile an index of EINs to URLs if it doesn't exist
if (!fs.existsSync(EIN_INDEX_PATH)) {
  const index = {};
  for (const file of fs.readdirSync(`./indexes`)) {
    if (file.includes(".json")) {
      const json = JSON.parse(fs.readFileSync(`./indexes/${file}`));
      for (const k of Object.keys(json)) {
        for (const filing of json[k]) {
          index[filing.EIN] = index[filing.EIN] ?? [];
          index[filing.EIN].push(
            filing.URL.replace("https://s3.amazonaws.com/irs-form-990/", "")
          );
          index[filing.EIN].sort();
        }
      }
    }
  }
  fs.writeFileSync(EIN_INDEX_PATH, JSON.stringify(index));
}

// Load the index of EINs to URLs
module.exports = JSON.parse(fs.readFileSync(EIN_INDEX_PATH));
