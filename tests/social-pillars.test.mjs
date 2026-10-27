// Tests for lib/social-pillars.js — pillar assignments read from a content-calendar sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetCsvUrl, parsePillarSheet, makePillarLookup } from "../lib/social-pillars.js";

const csv = [
  'Publish Date,Post Link,Caption,Content Pillar',
  '2026-10-06,https://www.facebook.com/page/posts/123/?ref=x,"Slow mornings, on the terrace",The Heritage Stay',
  '07/10/2026,,"Swan Lake reel — rare swan",For the Curious Traveller',
  '2026-10-08,,No pillar yet,',
].join("\n");

test("sheetCsvUrl turns a sheet link into a CSV export, keeping the tab", () => {
  assert.equal(sheetCsvUrl("https://docs.google.com/spreadsheets/d/abc_123/edit#gid=77"), "https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=77");
  assert.equal(sheetCsvUrl("https://example.com"), null);
});

test("parsePillarSheet reads columns by header and skips rows without a pillar", () => {
  const rows = parsePillarSheet(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pillar, "The Heritage Stay");
  assert.equal(rows[1].date, "2026-10-07"); // DD/MM/YYYY
});

test("makePillarLookup matches by link (ignoring query/www) or by date + caption start", () => {
  const find = makePillarLookup(parsePillarSheet(csv));
  assert.equal(find({ link: "https://facebook.com/page/posts/123", date: "2026-10-01", copy: "x" }), "The Heritage Stay");
  assert.equal(find({ link: null, date: "2026-10-07", copy: "Swan Lake reel — rare swan, filmed at dawn" }), "For the Curious Traveller");
  assert.equal(find({ link: "https://facebook.com/other", date: "2026-10-09", copy: "unrelated" }), null);
});
