/* Checks that the text of the DDM pages follows the sample on the bench: run with node test-text.js after
   python3 build.py --preview (it opens the preview pages with Playwright; several minutes). For each case the page is set
   to a sample, the run is awaited, and the visible text of the steps named must (or must not) contain the phrases given. */
"use strict";
const { chromium } = require("playwright");
const path = require("path");
const CASES = [
  { page: "ddm-swimmers.html", set: { swim_frac: 0 }, checks: [
    ["#step-curves", false, /first quickly, because the swimmers/], ["#step-curves", true, /no cell swims/i], ["#result", true, /no swimm|nothing swims|one kind of motion/i]] },
  { page: "ddm-swimmers.html", set: { swim_frac: 1 }, checks: [["#step-curves", true, /almost every cell swims/i]] },
  { page: "ddm-drift.html", set: { cause: "none" }, checks: [
    ["#step-curves", false, /^Along the drift$|^Across the drift$/m], ["#step-curves", true, /q along x/]] },
  { page: "ddm-crowded.html", set: { label: 0.05, mode: "spinning" }, checks: [
    ["#step-curves", true, /single particles/], ["#step-rates", false, /It is highest at the spacing of neighbours/], ["#step-rates", true, /pairs are too rare|Pairs of dyed neighbours are rare/]] },
  { page: "ddm-rheology.html", set: { mat: "newtonian" }, checks: [["#result", false, /Solid-like/], ["#result", true, /liquid/i]] },
  { page: "ddm-rheology.html", set: { mat: "gel" }, checks: [["#result", true, /Solid-like/]] },
  { page: "ddm-proteins.html", set: { protein: "bsa" }, checks: [["#hero-cap", true, /albumin/], ["#result", true, /repulsion between the proteins outweighs/]] },
  { page: "ddm-proteins.html", set: { protein: "sticky" }, checks: [["#result", false, /repulsion between the proteins outweighs/], ["#result", true, /drag of neighbours/]] },
  { page: "ddm-hands-on.html", set: { diameter_um: 0.4 }, checks: [["#result", true, /400 nm|0\.4/]] },
  { page: "ddm-tissues.html", set: { tstate: "jammed" }, checks: [["#net-result", true, /the sheet is solid/], ["#net-result", true, /Neighbours as simulated/]] },
  { page: "ddm-tissues.html", set: { tstate: "fluid", v0_um_h: 30 }, checks: [["#net-result", true, /Cells swap neighbours/], ["#net-result", false, /the sheet is solid/]] }
];
(async () => {
  const b = await chromium.launch(); let fails = 0;
  for (const c of CASES) {
    const pg = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; pg.on("pageerror", function (e) { errs.push(e.message); });
    await pg.goto("file://" + path.join(__dirname, c.page) + "#student");
    const done = function () { return pg.waitForFunction(function () { const t = document.getElementById("status").textContent; return /^Done/.test(t) || /stopped/.test(t); }, null, { timeout: 400000 }); };
    await done();
    await pg.evaluate(function (s) { document.getElementById("status").textContent = ""; DDM_PAGE.preset(s); }, c.set); await pg.waitForTimeout(400); await done();   // "Done" cleared first, so the wait is for the new run
    for (const k of c.checks) {
      const txt = await pg.evaluate(function (sel) { const el = document.querySelector(sel); return el ? el.innerText : ""; }, k[0]);
      const ok = k[2].test(txt) === k[1];
      console.log((ok ? "ok   " : "FAIL ") + c.page + " " + JSON.stringify(c.set) + " " + k[0] + (k[1] ? " has " : " lacks ") + k[2]);
      if (!ok) fails++;
    }
    if (errs.length) { console.log("FAIL " + c.page + " page errors: " + errs.join("; ")); fails++; }
    await pg.close();
  }
  await b.close();
  console.log(fails ? fails + " check(s) failed" : "all checks passed"); process.exit(fails ? 1 : 0);
})();
