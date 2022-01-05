const ExcelJS = require("exceljs");
const fs = require("fs");
const yaml = require("js-yaml");
const { parse } = require("csv-parse/sync");

// ws.getCell('B1').numFmt = '0.00%';

const cellAddress = (col, row) => {
  const c1 = Math.floor(parseInt(col) / 26);
  const c2 = parseInt(col) % 26;
  const addr =
    c1 < 1
      ? `${String.fromCharCode(c2 + 65)}${parseInt(row) + 1}`
      : `${String.fromCharCode(c1 + 64)}${String.fromCharCode(c2 + 65)}${
          row + 1
        }`;
  return addr;
};

if (process.argv.length < 3) {
  console.log(`Usage: node buildReport.js <config.yml>`);
  process.exit(0);
}

const config = yaml.load(fs.readFileSync(process.argv[2], "utf8"));

const data = parse(fs.readFileSync(config.input, "utf8").toString(), {
  columns: true,
});

const years = Array.from(new Set(data.map((d) => parseInt(d["Tax Year"])))).map(
  (d) => parseInt(d)
);

const setFont = (addr, bold) =>
  (addr.font = {
    size: 16,
    bold,
  });

const einType = (ein) => {
  if (config.highlight?.includes(ein)) return 1;
  if (config.peers?.includes(ein)) return 2;
  return 0;
};

const highlightCell = (ein, cell) => {
  switch (einType(ein)) {
    case 2:
      cell.font = {
        size: 16,
        bold: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFBBFFBB" },
      };
      break;
    case 1:
      cell.font = {
        size: 16,
        bold: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFBBBBFF" },
      };
      break;
  }
};

const twist = (field) => {
  const rowsObjects = {};
  for (const row of data) {
    if (!rowsObjects[row.EIN]) {
      rowsObjects[row.EIN] = {
        EIN: row.EIN,
        BusinessName: row["Business Name"],
        average: 0,
      };
    }

    if (row[field]) {
      rowsObjects[row.EIN][parseInt(row["Tax Year"])] = parseFloat(row[field]);

      let total = 0;
      let count = 0;
      for (const year of years) {
        if (rowsObjects[row.EIN][parseInt(year)] !== undefined) {
          total += rowsObjects[row.EIN][parseInt(year)];
          count += 1;
        }
      }
      rowsObjects[row.EIN].average = count > 0 ? total / count : 0;
    }
  }
  return Object.values(rowsObjects).sort((a, b) => b.average - a.average);
};

function createRankingSheet(workbook) {
  const rankings = workbook.addWorksheet("Rankings");

  for (const fieldIndex in config.fields) {
    rankings.getCell(cellAddress(parseInt(fieldIndex), 0)).value =
      config.fields[fieldIndex];
    setFont(rankings.getColumn(parseInt(fieldIndex) + 1));
    rankings.getColumn(parseInt(fieldIndex) + 1).width = 75;
  }
  rankings.getCell(cellAddress(config.fields.length, 0)).value = "Overall";
  setFont(rankings.getColumn(config.fields.length + 1));
  rankings.getColumn(config.fields.length + 1).width = 75;

  setFont(rankings.getRow(1), true);

  const totalRankings = {};

  for (const fieldIndex in config.fields) {
    const rows = twist(config.fields[fieldIndex]);
    for (const rowIndex in rows) {
      rankings.getCell(
        cellAddress(parseInt(fieldIndex), parseInt(rowIndex) + 1)
      ).value = rows[rowIndex].BusinessName;
      highlightCell(
        rows[rowIndex].EIN,
        rankings.getCell(
          cellAddress(parseInt(fieldIndex), parseInt(rowIndex) + 1)
        )
      );

      if (totalRankings[rows[rowIndex].EIN] === undefined) {
        totalRankings[rows[rowIndex].EIN] = {
          EIN: rows[rowIndex].EIN,
          BusinessName: rows[rowIndex].BusinessName,
        };
      }
      totalRankings[rows[rowIndex].EIN][config.fields[fieldIndex]] =
        parseInt(rowIndex);

      let total = 0;
      let count = 0;
      for (const avgFieldIndex in config.fields) {
        if (
          totalRankings[rows[rowIndex].EIN][config.fields[avgFieldIndex]] !==
          undefined
        ) {
          count +=
            totalRankings[rows[rowIndex].EIN][config.fields[avgFieldIndex]];
          total += 1;
        }
      }
      totalRankings[rows[rowIndex].EIN].average = count / total;
    }
  }

  const avgRankings = Object.values(totalRankings).sort(
    (a, b) => a.average - b.average
  );

  for (const rowIndex in avgRankings) {
    rankings.getCell(
      cellAddress(config.fields.length, parseInt(rowIndex) + 1)
    ).value = `${avgRankings[rowIndex].BusinessName} (${avgRankings[
      rowIndex
    ].average.toFixed(1)})`;
    highlightCell(
      avgRankings[rowIndex].EIN,
      rankings.getCell(
        cellAddress(config.fields.length, parseInt(rowIndex) + 1)
      )
    );
  }
}

function createFieldSheet(workbook, field) {
  const fieldSheet = workbook.addWorksheet(field);

  const rows = twist(field);

  fieldSheet.getCell(cellAddress(0, 0)).value = "Business Name";
  setFont(fieldSheet.getColumn(1));
  fieldSheet.getColumn(1).width = 50;

  fieldSheet.getCell(cellAddress(years.length + 1, 0)).value = "Average";
  setFont(fieldSheet.getColumn(years.length + 2));
  fieldSheet.getColumn(years.length + 2).width = 25;

  for (const yearIndex in years) {
    fieldSheet.getCell(cellAddress(parseInt(yearIndex) + 1, 0)).value =
      years[yearIndex];
    setFont(fieldSheet.getColumn(parseInt(yearIndex) + 2));
    fieldSheet.getColumn(parseInt(yearIndex) + 2).width = 25;
  }
  setFont(fieldSheet.getRow(1), true);

  for (const rowIndex in rows) {
    fieldSheet.getCell(cellAddress(0, parseInt(rowIndex) + 1)).value =
      rows[rowIndex].BusinessName;
    highlightCell(
      rows[rowIndex].EIN,
      fieldSheet.getCell(cellAddress(0, parseInt(rowIndex) + 1))
    );

    for (const yearIndex in years) {
      const year = years[yearIndex];

      if (rows[rowIndex][year] !== undefined) {
        const cell = fieldSheet.getCell(
          cellAddress(parseInt(yearIndex) + 1, parseInt(rowIndex) + 1)
        );
        cell.value = rows[rowIndex][year];
        if (config.numFmt[field]) {
          cell.numFmt = config.numFmt[field];
        }

        highlightCell(
          rows[rowIndex].EIN,
          fieldSheet.getCell(
            cellAddress(parseInt(yearIndex) + 1, parseInt(rowIndex) + 1)
          )
        );
      }

      const avgCell = fieldSheet.getCell(
        cellAddress(years.length + 1, parseInt(rowIndex) + 1)
      );
      avgCell.value = rows[rowIndex].average;
      if (config.numFmt[field]) {
        avgCell.numFmt = config.numFmt[field];
      }

      highlightCell(
        rows[rowIndex].EIN,
        fieldSheet.getCell(
          cellAddress(years.length + 1, parseInt(rowIndex) + 1)
        )
      );
    }
  }
}

function createOriginalSheet(workbook) {
  const original = workbook.addWorksheet("Original");

  original.getCell(cellAddress(0, 0)).value = "EIN";
  setFont(original.getColumn(1));
  original.getColumn(1).width = 25;

  original.getCell(cellAddress(1, 0)).value = "Business Name";
  setFont(original.getColumn(2));
  original.getColumn(2).width = 50;

  original.getCell(cellAddress(2, 0)).value = "Year";
  setFont(original.getColumn(3));

  for (const fieldIndex in config.fields) {
    original.getCell(cellAddress(parseInt(fieldIndex) + 3, 0)).value =
      config.fields[fieldIndex];
    setFont(original.getColumn(parseInt(fieldIndex) + 4));
    original.getColumn(parseInt(fieldIndex) + 4).width = 25;
  }
  setFont(original.getRow(1), true);

  for (const rowIndex in data) {
    for (const fieldIndex in config.fields) {
      original.getCell(
        cellAddress(0, parseInt(rowIndex) + 1)
      ).value = `${data[rowIndex].EIN}`;
      original.getCell(cellAddress(1, parseInt(rowIndex) + 1)).value =
        data[rowIndex]["Business Name"];
      original.getCell(cellAddress(2, parseInt(rowIndex) + 1)).value = parseInt(
        data[rowIndex]["Tax Year"]
      );

      highlightCell(
        data[rowIndex].EIN,
        original.getCell(cellAddress(0, parseInt(rowIndex) + 1))
      );
      highlightCell(
        data[rowIndex].EIN,
        original.getCell(cellAddress(1, parseInt(rowIndex) + 1))
      );
      highlightCell(
        data[rowIndex].EIN,
        original.getCell(cellAddress(2, parseInt(rowIndex) + 1))
      );

      if (data[rowIndex][config.fields[fieldIndex]]) {
        const cell = original.getCell(
          cellAddress(parseInt(fieldIndex) + 3, parseInt(rowIndex) + 1)
        );
        cell.value = parseFloat(data[rowIndex][config.fields[fieldIndex]]);
        if (config.numFmt[config.fields[fieldIndex]]) {
          cell.numFmt = config.numFmt[config.fields[fieldIndex]];
        }

        highlightCell(
          data[rowIndex].EIN,
          original.getCell(
            cellAddress(parseInt(fieldIndex) + 3, parseInt(rowIndex) + 1)
          )
        );
      }
    }
  }
}

(async function () {
  const workbook = new ExcelJS.Workbook();

  createOriginalSheet(workbook);

  for (const fields in config.fields) {
    createFieldSheet(workbook, config.fields[fields]);
  }

  createRankingSheet(workbook);

  if (fs.existsSync(config.output)) {
    fs.unlinkSync(config.output);
  }
  await workbook.xlsx.writeFile(config.output);
})();
