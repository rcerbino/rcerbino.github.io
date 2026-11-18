/* Checks of the proteins page: run with node test-protein.js (about two minutes)
   protein.js: hard spheres give A2 = 4 v_h / M and k_D = 1.45 v_h; Bjerrum and Debye lengths; the antibody and albumin presets.
   field-movie.js + protein-engine.js: D_c of one bench (four movies) within its uncertainty and 3 %; the published method
   alone reads it low; a series of the antibody at 115 mM salt gives k_D, A2 and R_h back within their uncertainties. */
"use strict";
const P = require("./protein.js"), F = require("./field-movie.js"), DDM = require("./ddm-engine.js"), PE = require("./protein-engine.js");
let fails = 0;
function check(name, ok, msg) { console.log((ok ? "ok   " : "FAIL ") + name + ": " + msg); if (!ok) fails++; }
const T = 22, ETA = 0.955e-3;
function props(o) { return P.properties(Object.assign({ T_C: T, eta_Pa_s: ETA, delta_nm: 0.3 }, o)); }

// ---- the interaction model ----
const hs = props({ M_g_mol: 148000, Rh_nm: 5.3, Z: 0, I_mM: 150, eps_kT: 0 });
check("hard spheres: A2 = 4 v_h / M", Math.abs(hs.A2_mol_mL_g2 / (4 * hs.vh_mL_g / hs.M_g_mol) - 1) < 1e-3, hs.A2_mol_mL_g2.toExponential(4) + " vs " + (4 * hs.vh_mL_g / hs.M_g_mol).toExponential(4));
check("hard spheres: k_D = 1.45 v_h", Math.abs(hs.kD_mL_g / hs.vh_mL_g - 1.45) < 1e-3, (hs.kD_mL_g / hs.vh_mL_g).toFixed(4));
check("Bjerrum length in water at 25 C", Math.abs(P.bjerrumNm(25) - 0.714) < 0.005, P.bjerrumNm(25).toFixed(4) + " nm");
check("Debye length, 100 mM, 25 C", Math.abs(P.debyeNm(0.1, 25) - 0.961) < 0.01, P.debyeNm(0.1, 25).toFixed(3) + " nm");
const mabLow = props({ M_g_mol: 148000, Rh_nm: 5.3, Z: 12, I_mM: 15, eps_kT: 2.7 }), mabHigh = props({ M_g_mol: 148000, Rh_nm: 5.3, Z: 12, I_mM: 115, eps_kT: 2.7 });
check("antibody, 15 mM: repulsive, k_D about +14 mL/g", mabLow.kD_mL_g > 12 && mabLow.kD_mL_g < 15, mabLow.kD_mL_g.toFixed(2));
check("antibody, 115 mM: k_D about -5 mL/g", mabHigh.kD_mL_g > -5.5 && mabHigh.kD_mL_g < -4.3, mabHigh.kD_mL_g.toFixed(2));
const bsa = props({ M_g_mol: 66400, Rh_nm: 3.4, Z: -13, I_mM: 160, eps_kT: 0 });
check("albumin in saline: k_D near the 4 +- 1 mL/g of Guidolin et al.", bsa.kD_mL_g > 3 && bsa.kD_mL_g < 5.5, bsa.kD_mL_g.toFixed(2));
check("more salt screens more: B2 falls", mabHigh.A2_mol_mL_g2 < mabLow.A2_mol_mL_g2, mabLow.A2_mol_mL_g2.toExponential(2) + " -> " + mabHigh.A2_mol_mL_g2.toExponential(2));

// ---- movies and analysis: the bench of the page (20x NA 0.5, condenser NA 0.1, ORCA binned 2 x 2, 500 frames/s) ----
function cfgAt(pr, c, seed) {
  return { seed: seed, mode: "brightfield", objective: { mag: 20, na: 0.5 }, illum: { na_in: 0, na_out: 0.1 }, source: "green", liquid: { glycerol_w: 0 },
    detector: { kind: "camera", pixel_um: 6.5, binning: 2, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000 }, n_px: 128, n_frames: 512, frame_rate_hz: 500, exposure_s: 0.00199,
    T_C: T, cell_um: 100, focus_um: 50, light_frac: 0.7,
    protein: { diameter_um: 2 * P.volumeRadiusNm(pr.M_g_mol, 0.73) / 1000, n: P.proteinIndex(1.333, 0.185, 0.73), number_density_um3: pr.numberDensity_um3(c), S0: pr.S0(c), Dc_um2_s: pr.Dc(c) } };
}
function bench(pr, c, seed, R) {
  const mv = []; for (let k = 0; k < R; k++) mv.push(DDM.runToEnd(F.simulate(cfgAt(pr, c, seed + 7919 * k))));
  return { movies: mv, res: DDM.runToEnd(PE.analyse(mv, { amp_q: [0.6, 2.5] })), pub: DDM.runToEnd(PE.analyse(mv, { amp_q: [0.6, 2.5], published_only: true })) };
}
let t0 = Date.now();
const b = bench(mabHigh, 20, 1, 4), dt = mabHigh.Dc(20), off = b.res.D_um2_s / dt - 1;
console.log("     bench: " + ((Date.now() - t0) / 1000).toFixed(1) + " s, D " + b.res.D_um2_s.toFixed(2) + " +- " + (100 * b.res.D_rel_err).toFixed(1) + " % (true " + dt.toFixed(2) + "), " + b.res.rows.filter(function (r) { return r.used; }).length + " q used");
check("bench: D_c within 3 uncertainties and 3 %", Math.abs(off) < Math.max(0.03, 3 * b.res.D_rel_err), (100 * off).toFixed(1) + " %");
check("published method alone reads D_c low (no depth of field, no exposure)", b.pub.D_um2_s < 0.95 * dt, (100 * (b.pub.D_um2_s / dt - 1)).toFixed(1) + " %");

// a series, as the page runs it: five concentrations up to 30 mg/mL, two movies each, independent seeds
t0 = Date.now();
const pts = [], kept = [];
[4.5, 9, 15, 22.5, 30].forEach(function (c, i) {
  const s = bench(mabHigh, c, 1 + 104729 * (i + 1), 2);
  pts.push({ c: c, D: s.res.D_um2_s, D_rel_err: s.res.D_rel_err, A: s.res.A_mean, A_rel_err: s.res.A_rel_err }); kept.push(s.res);
});
let fit = PE.series(pts, mabHigh.M_g_mol, T, ETA);
pts.forEach(function (p, i) { const a = PE.amplitudeAt(kept[i], fit.lineD.a + fit.lineD.b * p.c); if (a) { p.A = a.A; p.A_rel_err = a.rel_err; } });
fit = PE.series(pts, mabHigh.M_g_mol, T, ETA);
console.log("     series: " + ((Date.now() - t0) / 1000).toFixed(1) + " s; k_D " + fit.kD_mL_g.toFixed(2) + " +- " + fit.kD_err.toFixed(2) + " (true " + mabHigh.kD_mL_g.toFixed(2) + "), A2 " + fit.A2.toExponential(2) + " +- " + fit.A2_err.toExponential(1) + " (true " + mabHigh.A2_mol_mL_g2.toExponential(2) + "), R_h " + fit.Rh_nm.toFixed(2) + " nm");
check("series: k_D within 3 uncertainties", Math.abs(fit.kD_mL_g - mabHigh.kD_mL_g) < 3 * fit.kD_err, fit.kD_mL_g.toFixed(2) + " vs " + mabHigh.kD_mL_g.toFixed(2));
check("series: A2 within 3 uncertainties", Math.abs(fit.A2 - mabHigh.A2_mol_mL_g2) < 3 * fit.A2_err, fit.A2.toExponential(2) + " vs " + mabHigh.A2_mol_mL_g2.toExponential(2));
check("series: R_h within 5 %", Math.abs(fit.Rh_nm / 5.3 - 1) < 0.05, fit.Rh_nm.toFixed(2) + " nm");
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exit(fails ? 1 : 0);
