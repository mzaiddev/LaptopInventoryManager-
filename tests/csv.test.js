const test = require("node:test");
const assert = require("node:assert");
const csv = require("../src/shared/csv");

test("parse reads quoted commas, quotes, newlines, CRLF and a leading BOM", () => {
  const text = '﻿name,note\r\n"Ali, Sons","said ""hi"""\r\nBilal,"two\nlines"\r\n';
  assert.deepStrictEqual(csv.parse(text), [
    ["name", "note"],
    ["Ali, Sons", 'said "hi"'],
    ["Bilal", "two\nlines"],
  ]);
});

test("parse ignores blank lines and refuses an unfinished quote", () => {
  assert.deepStrictEqual(csv.parse("a,b\n\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.throws(() => csv.parse('a,b\n"open,1'), /unfinished/i);
});

test("toObjects turns the header row into lower-case underscore keys and trims cells", () => {
  const rows = csv.parse("Customer Name , Phone\n  Ali ,0300\n");
  assert.deepStrictEqual(csv.toObjects(rows), [{ customer_name: "Ali", phone: "0300" }]);
});

test("stringify quotes what needs it and stops spreadsheet formulas in text cells", () => {
  const out = csv.stringify([["name", "note"], ["Ali, Sons", 'say "hi"'], ["=SUM(A1)", 5], ["+92300", "-x"]]);
  assert.strictEqual(out, 'name,note\r\n"Ali, Sons","say ""hi"""\r\n\'=SUM(A1),5\r\n\'+92300,\'-x\r\n');
});

test("numbers, including negatives, are written as numbers and empty cells stay empty", () => {
  assert.strictEqual(csv.stringify([[-5, null, undefined, 0]]), "-5,,,0\r\n");
});
