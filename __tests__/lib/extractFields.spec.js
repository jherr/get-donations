const fs = require("fs");
const path = require("path");
const { DOMParser } = require("xmldom");

const {
  isValidFormat,
  extractFields,
  getTaxYear,
} = require("../../lib/extractFields");

describe("extractFields", () => {
  let doc = null;

  beforeAll(() => {
    const xmlText = fs.readFileSync(
      path.resolve(__dirname, "./__fixtures__/penn-2018.xml"),
      "utf8"
    );
    doc = new DOMParser().parseFromString(xmlText, "text/xml");
  });

  it("should extract the right tax year", () => {
    expect(getTaxYear(doc)).toBe(2018);
  });

  it("should say that the XML file is valid", () => {
    expect(isValidFormat(doc)).toBe(true);
  });

  it("should extract the values we expect", () => {
    expect(extractFields(doc)).toMatchSnapshot();
  });
});
