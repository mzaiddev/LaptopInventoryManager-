const test = require("node:test");
const assert = require("node:assert");
const { formatCompact } = require("../src/shared/compact");

const cases = [
  [0, "0"],
  [999, "999"],
  [99.5, "99.5"],
  [1000, "1K"],
  [12500, "12.5K"],
  [98000, "98K"],
  [999949, "999.9K"],
  [999950, "1M"],
  [999999, "1M"],
  [1000000, "1M"],
  [3250000, "3.3M"],
  [2552000, "2.6M"],
  [1500000000, "1.5B"],
  [-1500, "-1.5K"],
  [-999950, "-1M"],
  [null, "-"],
  [undefined, "-"],
  ["abc", "-"],
];

for (const [input, expected] of cases) {
  test(`formatCompact(${JSON.stringify(input)}) -> ${expected}`, () => {
    assert.strictEqual(formatCompact(input), expected);
  });
}
