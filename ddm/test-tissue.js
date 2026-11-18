/* Checks of the moving-tissues page: run with node test-tissue.js (about a minute)
   the four states of the model recognised; the velocity of the sheet; the displacement relative to the sheet in a jammed
   sheet within 25 % of the simulation; the network of nuclei (jammed and fluid): nuclei found, shape index and neighbours
   kept as in the simulation. */
"use strict";
const TM = require("./tissue-movie.js"), DDM = require("./ddm-engine.js"), TE = require("./tissue-engine.js"), TV = require("./tissue-voronoi.js");
let fails = 0;
function check(name, ok, msg) { console.log((ok ? "ok   " : "FAIL ") + name + ": " + msg); if (!ok) fails++; }
const base = { seed: 3, n_px: 128, pixel_um: 2.6, n_frames: 256, frame_min: 5, cell_um: 15, poly: 0.15, packing: 1.0, Dr_h: 0.5, muk_h: 20, nucleus_um: 2.5, photons: 20000, background: 50, read_noise_e: 6.4 };
function run(v0, J) { const mv = DDM.runToEnd(TM.simulate(Object.assign({}, base, { v0_um_h: v0, J_h: J }))); return { mv: mv, r: DDM.runToEnd(TE.analyse(mv, { cell_area_um2: 225 })) }; }
[[6, 0, "jammed"], [30, 0, "fluid"], [30, 2, "flocking liquid"], [8, 2, "flocking solid"]].forEach(function (c) {
  const s = run(c[0], c[1]), r = s.r, t = s.mv.truth;
  check("v0 " + c[0] + ", J " + c[1] + ": " + c[2], r.state === c[2], r.state + ", psi " + (r.psi === null ? "-" : r.psi.toFixed(2)) + " (order " + t.order.toFixed(2) + ")");
  const V = Math.hypot(r.V_um_h[0], r.V_um_h[1]), Vt = Math.hypot(t.drift_um_h[0], t.drift_um_h[1]);
  if (c[1] > 0) check("  sheet velocity within 10 %", Math.abs(V / Vt - 1) < 0.1, V.toFixed(2) + " vs " + Vt.toFixed(2) + " um/h");
  if (c[2] === "jammed") {
    const i = r.taus_s.findIndex(function (x) { return x >= 3; }), m = t.msd; let k = 0; while (k < m.lag_h.length - 1 && m.lag_h[k + 1] < r.taus_s[i]) k++;
    check("  displacement at 3 h within 25 %", Math.abs(r.msd[i] / m.um2[k] - 1) < 0.25, r.msd[i].toFixed(2) + " vs " + m.um2[k].toFixed(2) + " um^2");
  }
  if (c[1] === 0) {
    const nw = DDM.runToEnd(TV.analyse(s.mv, { spacing_um: 15 })), a = nw.measured, b = nw.truth;
    const k1 = function (l) { return l.find(function (x) { return Math.abs(x.lag_h - 1) < 1e-9; }).kept; };
    check("  nuclei found", b.found_frac > 0.98 && b.loc_err_um < 0.6, (100 * b.found_frac).toFixed(1) + " %, within " + b.loc_err_um.toFixed(2) + " um");
    check("  shape index within 0.01", Math.abs(a.p_mean - b.p_mean) < 0.01, a.p_mean.toFixed(3) + " vs " + b.p_mean.toFixed(3));
    check("  neighbours kept in 1 h within 0.02", Math.abs(k1(a.kept) - k1(b.kept)) < 0.02, k1(a.kept).toFixed(3) + " vs " + k1(b.kept).toFixed(3));
  }
});
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exit(fails ? 1 : 0);
