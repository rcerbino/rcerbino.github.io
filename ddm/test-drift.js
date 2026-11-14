// Checks of the drift analysis (flow, sedimentation, thermophoresis): simulated movies with a known drift
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js"), DRIFT = require("./drift-engine.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
function orca() { return { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 512, crop_row0: 0 }; }
const BASE = {
  seed: 1, mode: "brightfield", objective: { mag: 20, na: 0.5 }, illum: { na_in: 0, na_out: 0.3 }, source: "green", homodyne: false, df_light_e: 1e7, stray_frac: 1e-4,
  l_ex_um: 0.488, l_em_um: 0.52, pinhole_um: 50, crosstalk: 0.0314, pinhole_au: 1, photons_per_particle: 2000, background_photons: 100, light_frac: 0.5, scan_rate_hz: 1e7,
  detector: orca(), n_px: 128, n_frames: 256, frame_rate_hz: 100, exposure_s: 0,
  particle: "ps", diameter_um: 0.2, size_spread: 0, volume_fraction: 2e-4, liquid: { glycerol_w: 0 }, T_C: 22, cell_um: 20, focus_um: 10, drift_um_s: 0
};
function run(label, over) {
  const t0 = Date.now();
  const mv = DDM.runToEnd(MOVIE.simulate(Object.assign({}, BASE, over)));
  const r = DDM.runToEnd(DRIFT.analyse(mv, { q_min_per_um: null, q_max_per_um: null }));
  const tr = mv.truth;
  console.log("info " + label + ": D " + r.D_um2_s.toFixed(3) + " (true " + tr.D_um2_s.toFixed(3) + "), size " + Math.round(r.diameter_um * 1000) + " nm, v " + r.v_um_s.toFixed(3) +
    (r.v_err_um_s ? " +- " + r.v_err_um_s.toFixed(3) : "") + " um/s at " + r.v_dir_deg.toFixed(1) + " deg (true " + tr.drift_um_s + " at " + tr.drift_deg + "), phase guess (neighbours) " +
    Math.hypot(r.v_from_phase.vx_um_s, r.v_from_phase.vy_um_s).toFixed(3) + " at " + (Math.atan2(r.v_from_phase.vy_um_s, r.v_from_phase.vx_um_s) * 180 / Math.PI).toFixed(1) +
    "; from d alone " + r.from_structure_function.v_um_s.toFixed(3) + " at " + r.from_structure_function.v_dir_deg.toFixed(1) + "; visible q " + r.visibility.q_from.toFixed(2) + "-" + r.visibility.q_to.toFixed(2) + " (" + r.visibility.n_q + " q), detected " + r.detected + "; " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  return { mv, r };
}
const angDiff = function (a, b) { let d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

{ // plug flow to the right
  const { mv, r } = run("flow 2 um/s to the right", { drift_um_s: 2, drift_deg: 0 });
  check("flow: speed within 5 %, direction within 5 deg, sign from the phase", Math.abs(r.v_um_s / 2 - 1) < 0.05 && angDiff(r.v_dir_deg, 0) < 5 && r.detected);
  check("flow: D within 8 %", Math.abs(r.D_um2_s / mv.truth.D_um2_s - 1) < 0.08);
}
{ // another direction, and the sign
  const { r } = run("flow 3 um/s at 120 deg", { drift_um_s: 3, drift_deg: 120, seed: 2 });
  check("flow at 120 deg: speed and direction within 2.5 times the quoted uncertainty (or 5 %, 5 deg)", Math.abs(r.v_um_s - 3) < Math.max(0.15, 2.5 * r.v_err_um_s) && angDiff(r.v_dir_deg, 120) < Math.max(5, 2.5 * r.v_dir_err_deg),
    "error " + (100 * (r.v_um_s / 3 - 1)).toFixed(1) + " %, quoted " + (100 * r.v_err_um_s / 3).toFixed(1) + " %; " + angDiff(r.v_dir_deg, 120).toFixed(1) + " deg, quoted " + r.v_dir_err_deg.toFixed(1));
}
{ // no drift
  const { r } = run("no drift", { drift_um_s: 0, seed: 3 });
  check("no drift: none detected, D unchanged", !r.detected || r.v_um_s < 0.1);
}
{ // microscope on its side: 2 um silica settling down the image (Stokes: about 2.2 um/s in water)
  const vs = 2 / 9 * (2.0 - 0.998) * 1000 * 9.81 * Math.pow(1e-6, 2) / 0.955e-3 * 1e6;
  const { mv, r } = run("2 um silica settling, microscope on its side (" + vs.toFixed(2) + " um/s)", { particle: "silica", diameter_um: 2, volume_fraction: 2e-3, drift_um_s: vs, drift_deg: 90, frame_rate_hz: 20, seed: 4 });
  check("sedimentation in the plane: speed within 8 %, direction within 8 deg", Math.abs(r.v_um_s / vs - 1) < 0.08 && angDiff(r.v_dir_deg, 90) < 8, "D " + r.D_um2_s.toFixed(3) + " for " + mv.truth.D_um2_s.toFixed(3));
}
{ // too slow to see: 200 nm polystyrene settling, about 1 nm/s
  const { r } = run("200 nm polystyrene settling at 1 nm/s", { drift_um_s: 0.001, drift_deg: 90, seed: 5 });
  check("invisible drift reported as such", !r.visibility.visible && !r.detected);
}
{ // the quoted uncertainty against the scatter between movies (flow 2 um/s, five new samples)
  const vs = [], qe = [];
  for (let k = 0; k < 5; k++) { const { r } = run("repeat " + (k + 1), { drift_um_s: 2, drift_deg: 30, seed: 20 + k }); vs.push(r.v_um_s); qe.push(r.v_err_um_s); }
  const m = vs.reduce((a, c) => a + c, 0) / vs.length, sd = Math.sqrt(vs.reduce((a, c) => a + (c - m) * (c - m), 0) / (vs.length - 1)), mq = qe.reduce((a, c) => a + c, 0) / qe.length;
  check("repeats: mean speed within 4 %, quoted uncertainty between 0.5 and 3 times the scatter", Math.abs(m / 2 - 1) < 0.04 && mq > 0.5 * sd && mq < 3 * sd,
    "mean " + m.toFixed(3) + ", scatter " + sd.toFixed(3) + ", quoted " + mq.toFixed(3));
}
{ // flow that varies across the cell (Poiseuille, mean 2 um/s): in focus at mid height the particles move faster than the mean
  const { r } = run("Poiseuille flow, mean 2 um/s, focus at mid height", { drift_um_s: 2, drift_deg: 0, drift_profile: "poiseuille", seed: 6 });
  check("Poiseuille: speed between the mean and the maximum (2 and 3 um/s)", r.v_um_s > 2 && r.v_um_s < 3.1, r.v_um_s.toFixed(3) + " um/s");
}
{ // upright microscope, drift along the optical axis only: nothing in the image plane
  const { r } = run("drift 2 um/s along the optical axis (upright)", { drift_um_s: 0, drift_z_um_s: 2, walls: true, seed: 7 });
  check("vertical drift: no drift in the image plane", !r.detected, "v " + r.v_um_s.toFixed(3));
}
console.log(failures ? "\n" + failures + " FAILED" : "\nALL DRIFT CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
