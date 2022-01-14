const fs = require("fs");
const { dump } = require("js-yaml");

const megaIndexes = {};
const byState = {};
for (file of fs.readdirSync("./mega-indexes").sort()) {
  for (const row of JSON.parse(fs.readFileSync(`./mega-indexes/${file}`))) {
    megaIndexes[row.ein] = row.businessName;
    if (row.state && row.state.length) {
      byState[row.state] = byState[row.state] ?? {};
      byState[row.state][row.ein] = row.businessName;
    }
  }
}

fs.writeFileSync("./lists/all.yml", dump(megaIndexes));

for (const state of Object.keys(byState)) {
  fs.writeFileSync(`./lists/${state}.yml`, dump(byState[state]));
}
