import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDiscount } from "./discount";

test("below threshold: no discount", () => {
  assert.equal(calculateDiscount(0), 0);
  assert.equal(calculateDiscount(650_000), 0);
  assert.equal(calculateDiscount(999_999), 0);
});

test("exactly at threshold: 10%", () => {
  assert.equal(calculateDiscount(1_000_000), 100_000);
});

test("between threshold and cap: 10%", () => {
  assert.equal(calculateDiscount(1_300_000), 130_000);
  assert.equal(calculateDiscount(1_500_000), 150_000);
});

test("exactly at cap: 10% equals max", () => {
  assert.equal(calculateDiscount(2_000_000), 200_000);
});

test("above cap: limited to 200,000", () => {
  assert.equal(calculateDiscount(2_250_000), 200_000);
  assert.equal(calculateDiscount(10_000_000), 200_000);
});

test("odd amount: rounds down", () => {
  assert.equal(calculateDiscount(1_000_009), 100_000);
});
