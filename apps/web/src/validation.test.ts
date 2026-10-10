import test from "node:test";
import assert from "node:assert/strict";
import { emailFormatError, normalizeSlugSuggestion, passwordFormatError, slugFormatError } from "./validation";

test("normalizes suggestions without changing manual edits", () => {
    assert.equal(normalizeSlugSuggestion("Café Prime !!!"), "cafe-prime");
    assert.equal(normalizeSlugSuggestion(" cafe--prime "), "cafe-prime");
    assert.equal(normalizeSlugSuggestion("Cafe_Prime"), "cafe-prime");
    assert.equal(normalizeSlugSuggestion("MY CAFE 2026"), "my-cafe-2026");
    assert.equal(normalizeSlugSuggestion("-cafe-prime-"), "cafe-prime");
  });

test("matches the API slug contract", () => {
    assert.equal(slugFormatError("cafe-prime"), "");
    assert.equal(slugFormatError("cafe_prime"), "");
    assert.notEqual(slugFormatError("c"), "");
    assert.notEqual(slugFormatError("api"), "");
  });

test("does not report login fields valid before they are complete", () => {
    assert.notEqual(emailFormatError("varneeth@"), "");
    assert.equal(emailFormatError("varneeth@example.com"), "");
    assert.notEqual(passwordFormatError("short"), "");
    assert.equal(passwordFormatError("long-enough-password"), "");
  });
