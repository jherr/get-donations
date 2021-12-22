const fs = require("fs");
const path = require("path");
const { DOMParser } = require("xmldom");

const {
  isValidFormat,
  extractFields,
  getTaxYear,
} = require("../../lib/extractFields");

describe("extractFields", () => {
  let penn2018 = null;
  let northwestern2018 = null;

  beforeAll(() => {
    penn2018 = new DOMParser().parseFromString(
      fs.readFileSync(
        path.resolve(__dirname, "./__fixtures__/penn-2018.xml"),
        "utf8"
      ),
      "text/xml"
    );
    northwestern2018 = new DOMParser().parseFromString(
      fs.readFileSync(
        path.resolve(__dirname, "./__fixtures__/northwestern-2018.xml"),
        "utf8"
      ),
      "text/xml"
    );
  });

  it("should extract the right tax year", () => {
    expect(getTaxYear(penn2018)).toBe(2018);
  });

  it("should say that the XML file is valid", () => {
    expect(isValidFormat(penn2018)).toBe(true);
  });

  it("penn-2018", () => {
    expect(extractFields(penn2018)).toMatchSnapshot();
  });

  it("northwestern-2018", () => {
    expect(extractFields(northwestern2018)).toMatchSnapshot();
  });
});
