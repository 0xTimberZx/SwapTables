#!/usr/bin/env node
/**
 * Frontend gate for the SwapTables app pages.
 *
 * Two checks, both aimed at the ways these pages have actually broken:
 *
 *   1. SYNTAX — every inline <script> is parsed with `node --check`. The pages
 *      are hand-edited single files with no build step, so a stray brace ships
 *      silently and only surfaces when a player connects a wallet.
 *
 *   2. ADDRESS DRIFT — each page's ADDR block is compared against
 *      onchain/addresses.js. A generation deploy has to touch that file AND
 *      three ADDR blocks; a page left pointing at a retired board looks
 *      completely healthy while quietly transacting against the wrong
 *      generation. It also checks the live block does not still hold an
 *      address listed under RETIRED.
 *
 * No dependencies, no network. Run locally with:  node scripts/check-frontend.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT  = path.resolve(__dirname, "..");
const PAGES = ["app/index.html", "app/play.html", "app/live.html", "app/games.html"];

// ADDR key in the pages  ->  name in onchain/addresses.js
const KEYMAP = {
  board:   "SegmentBoard",
  ledger:  "PoolLedger",
  jackpot: "DDJackpot",
  timbs:   "TIMBSToken",
  crank:   "SegmentCrank",
  prize:   "TimbPrize",
};

let failures = 0;
const fail = (msg) => { console.error("  FAIL  " + msg); failures++; };
const ok   = (msg) => console.log("  ok    " + msg);

// ── addresses.js is the source of truth ────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, "onchain/addresses.js"), "utf8");
const liveBlock = src.split("export const RETIRED")[0];

const truth = {};
for (const [, name, addr] of liveBlock.matchAll(/^\s+(\w+):\s*"(0x[a-fA-F0-9]{40})"/gm)) {
  truth[name] = addr.toLowerCase();
}
// every address that appears under RETIRED — nothing live may equal one
const retired = new Set(
  [...src.slice(src.indexOf("export const RETIRED")).matchAll(/"(0x[a-fA-F0-9]{40})"/g)]
    .map((m) => m[1].toLowerCase())
);

if (!truth.SegmentBoard) {
  console.error("could not read addresses out of onchain/addresses.js — check the format");
  process.exit(1);
}
console.log(`addresses.js: ${Object.keys(truth).length} live, ${retired.size} retired `
          + `(SegmentBoard ${truth.SegmentBoard})\n`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swaptables-check-"));

for (const rel of PAGES) {
  console.log(rel);
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");

  // 1. every inline script must parse
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) fail("no inline <script> found — did the page change shape?");
  let bad = false;
  scripts.forEach((m, i) => {
    const file = path.join(tmp, `${path.basename(rel)}.${i}.mjs`);
    fs.writeFileSync(file, m[1]);
    const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (r.status !== 0) { fail(`inline script #${i} does not parse:\n${r.stderr.trim()}`); bad = true; }
  });
  if (!bad) ok(`${scripts.length} inline script(s) parse`);

  // 2. the ADDR block must agree with addresses.js, and never name a retired one
  const block = html.match(/const ADDR\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) { fail("no ADDR block found"); continue; }
  const entries = [...block[1].matchAll(/(\w+)\s*:\s*"(0x[a-fA-F0-9]{40})"/g)];
  if (!entries.length) fail("ADDR block held no addresses");
  for (const [, key, addr] of entries) {
    const low  = addr.toLowerCase();
    const want = KEYMAP[key];
    if (retired.has(low)) { fail(`ADDR.${key} points at a RETIRED address: ${addr}`); continue; }
    if (!want) { console.log(`  skip  ADDR.${key} — not mapped to addresses.js`); continue; }
    if (!truth[want]) { fail(`addresses.js has no live ${want} to compare ADDR.${key} against`); continue; }
    if (low !== truth[want]) {
      fail(`ADDR.${key} is ${addr}\n        addresses.js ${want} is ${truth[want]}`);
    } else {
      ok(`ADDR.${key} matches ${want}`);
    }
  }
  console.log("");
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log("frontend checks passed.");
