/* Checks of the crowded-particles analysis (crowd-engine.js) on simulated movies (movie.js, interact): run with node test-crowd.js
   Hard spheres at 30 %: the peak of S(q) from DDM against the simulation's own S(q); 5 %: the widest patterns as in the simulation, D = D0 / S;
   one particle in twenty dyed: no peak, and self diffusion slower than D0;
   with hydrodynamic interactions from theory (a density field): the peak of S(q) and H(q) = D S / D0 at the peak. Takes about a minute. */
"use strict";
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js"), CR = require("./crowd-engine.js");
const base = { seed: 1, mode: "spinning", objective: { mag: 60, na: 1.2, n_imm: 1.333 }, l_ex_um: 0.488, l_em_um: 0.52, photons_per_particle: 2000, background_photons: 4, pinhole_um: 50, crosstalk: 0.0314, pinhole_au: 1,
  detector: { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 256, crop_row0: 64 },
  n_px: 128, n_frames: 512, frame_rate_hz: 100, exposure_s: 0.002, log_timing: { factor: 5 }, particle: "pmma", diameter_um: 1, size_spread: 0, liquid: { glycerol_w: 0.5 }, T_C: 22, cell_um: 8, focus_um: 4,
  drift_um_s: 0, gravity: false, walls: false };
let fails = 0;
function check(name, ok, msg) { console.log((ok ? "ok   " : "FAIL ") + name + ": " + msg); if (!ok) fails++; }
function run(over, inter) {
  const cfg = Object.assign({}, base, over, { interact: Object.assign({ kind: "hard", label_fraction: 1 }, inter) });
  const t0 = Date.now(), mv = DDM.runToEnd(MOVIE.simulate(cfg)), tr = mv.truth.interact;
  const rv = DDM.runToEnd(MOVIE.simulate(CR.referenceConfig(cfg, tr.tau_B_s))), ref = DDM.runToEnd(CR.referenceAmplitude(rv));
  const r = DDM.runToEnd(CR.analyse(mv, { reference: ref, n_labelled: tr.n_labelled, D0_um2_s: tr.D0_um2_s }));
  const sTrue = function (q) { let k = 0; tr.q_per_um.forEach(function (x, i) { if (Math.abs(x - q) < Math.abs(tr.q_per_um[k] - q)) k = i; }); const a = tr.S[Math.max(0, k - 1)], b = tr.S[k], c = tr.S[Math.min(tr.S.length - 1, k + 1)]; return 1 + tr.label_fraction * ((a + 2 * b + c) / 4 - 1); };
  let tp = null; for (let q = r.window.q_min_used; q <= r.window.q_max_used; q += 0.02) { const v = sTrue(q); if (!tp || v > tp.S) tp = { q: q, S: v }; }
  console.log("     phi " + tr.phi + ", " + mv.info.n_particles + " particles (" + tr.n_labelled + " dyed), " + ((Date.now() - t0) / 1000).toFixed(1) + " s; peak " + r.peak.S.toFixed(2) + " at " + r.peak.q_per_um.toFixed(2) + " (true " + tp.S.toFixed(2) + " at " + tp.q.toFixed(2) + "), S low " + r.S_low.toFixed(2) + ", D/D0 peak " + (r.peak.D_um2_s / tr.D0_um2_s).toFixed(2) + ", low " + (r.D_low_um2_s / tr.D0_um2_s).toFixed(2));
  return { r: r, tr: tr, tp: tp, sTrue: sTrue };
}
let x = run({ volume_fraction: 0.3 }, {});
check("hard spheres 30 %: peak height", Math.abs(x.r.peak.S / x.tp.S - 1) < 0.15, x.r.peak.S.toFixed(2) + " vs " + x.tp.S.toFixed(2));
check("hard spheres 30 %: peak place", Math.abs(x.r.peak.q_per_um / x.tp.q - 1) < 0.07, x.r.peak.q_per_um.toFixed(2) + " vs " + x.tp.q.toFixed(2));
const dsp = x.r.peak.D_um2_s * x.tp.S / x.tr.D0_um2_s;
check("hard spheres 30 %: de Gennes narrowing, D S / D0 at the peak", dsp > 0.6 && dsp < 1.1, dsp.toFixed(2));
check("hard spheres 30 %: widest patterns faster than D0", x.r.D_low_um2_s > x.tr.D0_um2_s, (x.r.D_low_um2_s / x.tr.D0_um2_s).toFixed(2));
x = run({ volume_fraction: 0.05 }, {});
const lowQ = x.r.rows[x.r.k_low].q_per_um, sl = x.sTrue(lowQ);
check("5 %: S of the widest patterns as in the simulation", Math.abs(x.r.S_low / sl - 1) < 0.2, x.r.S_low.toFixed(2) + " vs " + sl.toFixed(2) + " (Percus-Yevick S(0) = " + CR.percusYevick(0.05, 0).toFixed(2) + ")");
check("5 %: D of the widest patterns near D0 / S", Math.abs(x.r.D_low_um2_s / x.tr.D0_um2_s * sl - 1) < 0.25, (x.r.D_low_um2_s / x.tr.D0_um2_s).toFixed(2) + " vs " + (1 / sl).toFixed(2));
x = run({ volume_fraction: 0.3 }, { label_fraction: 0.05 });
check("5 % dyed: no peak", x.r.peak.S < 1.2, "highest S " + x.r.peak.S.toFixed(2));
check("5 % dyed: self diffusion below D0", x.r.D_low_um2_s < 0.95 * x.tr.D0_um2_s, (x.r.D_low_um2_s / x.tr.D0_um2_s).toFixed(2));
x.r.rows.forEach(function (e, k) { if (k % 3 === 0) console.log("     q " + e.q_per_um.toFixed(2) + " S " + e.S.toFixed(2) + " (" + x.sTrue(e.q_per_um).toFixed(2) + ") D/D0 " + (e.D_um2_s / x.tr.D0_um2_s).toFixed(2) + (e.renewed ? "" : " not renewed")); });
// hydrodynamic interactions from theory (density field): S(q) and D(q) S(q) / D0 = H(q) at the peak
{
  const cfg = Object.assign({}, base, { volume_fraction: 0.3, interact: { kind: "hard", label_fraction: 1, hydro: CR.hydroTheory(0.3) } });
  const mv = DDM.runToEnd(MOVIE.simulate(cfg)), tr = mv.truth.interact;
  const ref = DDM.runToEnd(CR.referenceAmplitude(DDM.runToEnd(MOVIE.simulate(CR.referenceConfig(cfg, tr.tau_B_s)))));
  const r = DDM.runToEnd(CR.analyse(mv, { reference: ref, n_labelled: tr.n_labelled, D0_um2_s: tr.D0_um2_s }));
  const at = function (arr, q) { let k = 0; tr.q_per_um.forEach(function (x, i) { if (Math.abs(x - q) < Math.abs(tr.q_per_um[k] - q)) k = i; }); return arr[k]; };
  const Sth = at(tr.S, r.peak.q_per_um), Hth = at(tr.H, r.peak.q_per_um), Hm = r.peak.D_um2_s * r.peak.S / tr.D0_um2_s;
  console.log("     with hydrodynamics: Ds/D0 " + tr.Ds_over_D0.toFixed(3) + ", peak S " + r.peak.S.toFixed(2) + " (theory " + Sth.toFixed(2) + "), H " + Hm.toFixed(2) + " (theory " + Hth.toFixed(2) + ")");
  check("hydrodynamics: Beenakker-Mazur short-time self-diffusion at 30 %", Math.abs(tr.Ds_over_D0 - 0.454) < 0.01, tr.Ds_over_D0.toFixed(3));
  check("hydrodynamics: peak of S(q)", Math.abs(r.peak.S / Sth - 1) < 0.1, r.peak.S.toFixed(2) + " vs " + Sth.toFixed(2));
  check("hydrodynamics: H(q) at the peak from D S / D0", Math.abs(Hm / Hth - 1) < 0.12, Hm.toFixed(2) + " vs " + Hth.toFixed(2));
}
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exit(fails ? 1 : 0);
