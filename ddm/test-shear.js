/* Checks of the sheared-materials page (echo-DDM): run with node test-shear.js (about a minute)
   rubber: no fading, only a limit; viscous liquid: D of the Brownian motion along both directions; microgel above yield:
   D along the flow and the vorticity; every phase averaged reads D along the flow too high by about gamma0^2 D_h / 2. */
"use strict";
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js"), SH = require("./shear-engine.js");
let fails = 0;
function check(name, ok, msg) { console.log((ok ? "ok   " : "FAIL ") + name + ": " + msg); if (!ok) fails++; }
function orca() { return { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 512, crop_row0: 0 }; }
function run(shear, glyc, seed) {
  const cfg = { seed: seed || 1, mode: "brightfield", objective: { mag: 20, na: 0.45 }, illum: { na_in: 0, na_out: 0.52 }, source: "green", homodyne: true, light_frac: 0.5,
    detector: orca(), n_px: 128, n_frames: 512, frame_rate_hz: 4, exposure_s: 0.002, particle: "ps", diameter_um: 2, size_spread: 0, volume_fraction: 0.01,
    liquid: { glycerol_w: glyc || 0 }, T_C: 22, cell_um: 40, focus_um: 20, drift_um_s: 0, shear: shear };
  const mv = DDM.runToEnd(MOVIE.simulate(cfg));
  return { mv: mv, r: DDM.runToEnd(SH.analyse(mv, { frames_per_period: 4 })), all: DDM.runToEnd(SH.analyse(mv, { frames_per_period: 4, phase: "all" })) };
}
const rub = run({ strain: 0.5, freq_hz: 1, D_na_um2_s: [0, 0, 0] });
check("rubber: no rearrangement, only a limit", !rub.r.flow.D_um2_s && rub.r.flow.bound && rub.r.flow.bound.below < 3e-5, JSON.stringify(rub.r.flow.bound));
const lastF = rub.r.rows.filter(function (x) { return x.A > 10 * x.B && x.sec[0].reason !== "too few modes in this sector"; }).map(function (x) { return x.sec[0].f[x.sec[0].f.length - 1]; });
check("rubber: echoes stay at 1 (above 0.97)", lastF.length > 10 && Math.min.apply(null, lastF) > 0.97, "lowest " + Math.min.apply(null, lastF).toFixed(3));
const liq = run({ strain: 0.5, freq_hz: 1, D_na_um2_s: [0, 0, 0], brownian: true }, 0.9), Dt = liq.mv.truth.shear.D_thermal_um2_s;
check("liquid: D along the flow within 25 %", Math.abs(liq.r.flow.D_um2_s / Dt - 1) < 0.25, (liq.r.flow.D_um2_s / Dt).toFixed(3));
check("liquid: D along the vorticity within 25 %", Math.abs(liq.r.vort.D_um2_s / Dt - 1) < 0.25, (liq.r.vort.D_um2_s / Dt).toFixed(3));
const above = run({ strain: 0.8, freq_hz: 1, D_na_um2_s: [0.29, 0.19, 0.19] }, 0, 2);
check("microgel at 80 %: D along the flow within 25 %", Math.abs(above.r.flow.D_um2_s / 0.29 - 1) < 0.25, (above.r.flow.D_um2_s / 0.29).toFixed(3));
check("microgel at 80 %: D along the vorticity within 25 %", Math.abs(above.r.vort.D_um2_s / 0.19 - 1) < 0.25, (above.r.vort.D_um2_s / 0.19).toFixed(3));
const big = run({ strain: 1.5, freq_hz: 1, D_na_um2_s: [0, 0, 0], brownian: true }, 0.9, 3), ratio = big.all.flow.D_um2_s / big.r.flow.D_um2_s;
check("liquid at 150 %: every phase reads D along the flow higher, as 1 + gamma0^2 / 2", ratio > 1.3 && ratio < 2.6, ratio.toFixed(2) + " (the formula gives 2.1; patterns that fade within a few cycles read less)");
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exit(fails ? 1 : 0);
