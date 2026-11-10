// End-to-end checks: optics -> movie -> DDM analysis
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js"), O = require("./optics.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
// ORCA-Flash4.0 V3 on a 512-row region, centre-out rolling shutter
function orca(b, rows) { return { kind: "camera", pixel_um: 6.5, binning: b, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "rolling_center", t_row_s: 1 / (100 * 1024), rows_total: rows || 512, crop_row0: ((rows || 512) - 128 * b) / 2 }; }
function run(label, over, tol) {
  const cfg = Object.assign({
    seed: 1, mode: "brightfield", objective: { mag: 20, na: 0.5 }, illum: { na_in: 0, na_out: 0.3 }, source: "green", homodyne: false, df_light_e: 1e7, stray_frac: 1e-4,
    l_ex_um: 0.488, l_em_um: 0.52, pinhole_um: 50, crosstalk: 0.0314, pinhole_au: 1, photons_per_particle: 2000, background_photons: 100, light_frac: 0.5, scan_rate_hz: 1e7,
    detector: orca(1), n_px: 128, n_frames: 256, frame_rate_hz: 100, exposure_s: 0,
    particle: "ps", diameter_um: 0.2, size_spread: 0, volume_fraction: 2e-4, liquid: { glycerol_w: 0 }, T_C: 22, cell_um: 20, focus_um: 10, drift_um_s: 0
  }, over);
  const t0 = Date.now();
  const movie = DDM.runToEnd(MOVIE.simulate(cfg));
  const t1 = Date.now();
  const res = DDM.runToEnd(DDM.analyse(movie, { fit_model: "simple", q_min_per_um: null, q_max_per_um: null }));
  const t2 = Date.now();
  const dev = res.diameter_um === null ? null : res.diameter_um / movie.truth.diameter_um - 1;
  const msg = label + ": " + movie.info.n_particles + " particles, rank " + movie.info.rank + ", grid x" + movie.info.oversampling + "; true " + Math.round(movie.truth.diameter_um * 1000) + " nm, measured " + (res.diameter_um === null ? "none" : Math.round(res.diameter_um * 1000) + " nm +- " + (100 * res.diameter_rel_err).toFixed(1) + "%") + ", points " + (res.D ? res.D.n_points : 0) + ", slope " + (res.slope ? res.slope.exponent.toFixed(2) : "-") + "; movie " + (t1 - t0) + " ms, analysis " + (t2 - t1) + " ms";
  if (tol === null) { console.log("info " + msg); return { movie, res }; }
  check(msg, dev !== null && (Math.abs(dev) < tol || Math.abs(dev) < 2.5 * res.diameter_rel_err));
  return { movie, res };
}
// amplitude check: for independent particles the measured A(q) must equal 2 N <|K|^2>_z / a^4 (pixel and aliasing aside)
{
  const { movie, res } = run("bright field, 200 nm PS in water, 20x NA 0.5, condenser 0.3", {}, 0.08);
  const K = movie.info.kernel, nz = K.z_um.length; K.K = K.Kr; const qk = movie.info.kernel_q, a = movie.pixel_um, Np = movie.info.n_particles;
  let worst = 0, n = 0;
  for (const f of res.used) {
    const t = f.q_per_um / qk[qk.length - 2] * (qk.length - 2), i = Math.floor(t), fr = t - i;
    if (f.q_per_um > 0.5 * Math.PI / a) continue;           // keep away from pixel and alias effects
    let k2 = 0; for (let j = 0; j < nz; j++) { const v = K.K[i * nz + j] + fr * (K.K[(i + 1) * nz + j] - K.K[i * nz + j]); k2 += v * v; }
    const u = f.q_per_um * a / 2, pix = Math.pow(Math.sin(u) / u, 2);          // average of sinc^2 over directions approximated at the axis
    const theory = 2 * Np * (k2 / nz) / (a * a * a * a) * Math.pow(movie.info.background_e, 2) / (movie.n * movie.n);
    worst = Math.max(worst, Math.abs(f.A / theory - 1)); n++;
  }
  check("measured amplitude A(q) agrees with the optics (" + n + " q values)", worst < 0.25, "largest deviation " + (100 * worst).toFixed(0) + " %");
}
run("bright field, 500 nm PMMA in 50% glycerol", { particle: "pmma", diameter_um: 0.5, liquid: { glycerol_w: 0.5 }, frame_rate_hz: 20 }, 0.1);
run("bright field, 1 um PS, scattered intensity included", { diameter_um: 1.0, volume_fraction: 2e-3, frame_rate_hz: 20, homodyne: true }, 0.1);
run("widefield fluorescence, 200 nm", { mode: "fluorescence", exposure_s: 0.002 }, 0.1);
run("spinning-disk confocal, 200 nm, 60x NA 1.2 water", { mode: "spinning", objective: { mag: 60, na: 1.2 }, frame_rate_hz: 400, n_px: 128, cell_um: 10, focus_um: 5 }, 0.15);
run("2x2 binning, 200 nm", { detector: orca(2), frame_rate_hz: 100 }, 0.1);
run("global shutter (CB2-like, 2.74 um pixels, charge binning 2x2)", { objective: { mag: 20, na: 0.5 }, detector: { kind: "camera", pixel_um: 2.74, binning: 2, bin_charge: true, qe: 0.74, read_noise_e: 1.4, full_well_e: 9500, timing: "global", t_row_s: 0, rows_total: 1024, crop_row0: 384 }, frame_rate_hz: 100 }, 0.1);
run("rolling shutter, full 2048 rows at 100 frames/s, 100 nm (read-out spans the whole frame)", { diameter_um: 0.1, volume_fraction: 5e-5, detector: orca(1, 2048), frame_rate_hz: 100 }, 0.12);
run("phase contrast, 40x Ph2, 300 nm PS", { objective: { mag: 40, na: 0.75 }, illum: { na_in: 0.24, na_out: 0.29 }, pupil: { kind: "phase", ring_in: 0.24, ring_out: 0.29, amp: 0.5, phase: -Math.PI / 2 }, diameter_um: 0.3, volume_fraction: 2e-4, frame_rate_hz: 200, homodyne: true }, 0.1);
run("dark field, rich man's: annulus NA 0.8-0.95 around a 20x NA 0.5 objective, 300 nm", { illum: { na_in: 0.8, na_out: 0.95 }, diameter_um: 0.3, volume_fraction: 2e-4, frame_rate_hz: 100, homodyne: true }, 0.1);
run("dark field, poor man's: phase annulus NA 0.47-0.55 with a 10x NA 0.3 objective, 500 nm", { objective: { mag: 10, na: 0.3 }, illum: { na_in: 0.47, na_out: 0.55 }, diameter_um: 0.5, volume_fraction: 1e-4, frame_rate_hz: 30, homodyne: true }, 0.1);
// at NA 1.2 axial motion through the thin depth of field biases every transmitted mode low by 5-10 % (same for bright field),
// so this check freezes the axial motion and tests the DIC optics alone
run("DIC, 60x NA 1.2 water, shear 0.24 um, 300 nm, axial motion frozen", { test_freeze_z: true, n_frames: 512, seed: 2, objective: { mag: 60, na: 1.2 }, illum: { na_in: 0, na_out: 0.5 }, pupil: { kind: "dic", shear_um: 0.24, angle: Math.PI / 4, bias: Math.PI / 2 }, diameter_um: 0.3, volume_fraction: 4e-4, cell_um: 10, focus_um: 5, frame_rate_hz: 200, homodyne: false }, 0.1);
run("bright field, 200 um thick cell, 200 nm (info)", { cell_um: 200, focus_um: 100, volume_fraction: 1e-4, n_px: 64 }, null);
run("widefield fluorescence, 200 um thick cell (info)", { mode: "fluorescence", exposure_s: 0.002, cell_um: 200, focus_um: 100, volume_fraction: 1e-4, n_px: 64 }, null);
run("point scanning, AX R-like resonant, 60x water, 512 lines", { mode: "scanning", objective: { mag: 60, na: 1.2 }, cell_um: 10, focus_um: 5, frame_rate_hz: 7, diameter_um: 0.5, volume_fraction: 1e-3, scan_rate_hz: 2e8, background_photons: 0.01, n_frames: 512, n_px: 64, detector: { kind: "scanner", pixel_um: 0.3, qe: 0.4, dwell_s: 65.1e-6 * 0.7 / 512, passes: 4, t_row_s: 4 * 65.1e-6, rows_total: 512, crop_row0: 224 } }, null);   // biased low by particles leaving the optical section, like the spinning disk

// rotations: translation and rotation from a global two-mode fit. Tolerances reflect the statistics of short
// movies (about 10-15 % between seeds for D_R) and, for dark field, the l = 4 orientation mode the model leaves out.
function runRot(label, over, tolT, tolR) {
  const cfg = Object.assign({
    seed: 1, mode: "brightfield", objective: { mag: 20, na: 0.4 }, illum: { na_in: 0, na_out: 0.3 }, source: "halogen", homodyne: true, light_frac: 0.5, df_light_e: 1e7, stray_frac: 1e-4,
    detector: { kind: "camera", pixel_um: 6.5, binning: 2, bin_charge: false, qe: 0.8, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 256, crop_row0: 0 },
    n_px: 64, n_frames: 2048, frame_rate_hz: 800, exposure_s: 0.0012, particle: "rm257", diameter_um: 0.37, size_spread: 0, volume_fraction: 4e-5, liquid: { glycerol_w: 0 }, T_C: 20, cell_um: 50, focus_um: 25, drift_um_s: 0
  }, over);
  const t0 = Date.now(), m = DDM.runToEnd(MOVIE.simulate(cfg)), t1 = Date.now();
  const r = DDM.runToEnd(DDM.analyse(m, { fit_model: over.fit_model || "two", q_min_per_um: null, q_max_per_um: null, images: over.images || "recorded" })), t2 = Date.now();
  const Dtrue = m.truth.walls ? m.truth.D_plane_um2_s : m.truth.D_um2_s;
  const dT = r.D ? r.D.D_um2_s / Dtrue - 1 : null, dR = r.rot && r.rot.D_r_s ? r.rot.D_r_s / m.truth.D_r_s - 1 : null;
  const msg = label + ": " + m.info.n_particles + " particles; D_T " + (r.D ? r.D.D_um2_s.toFixed(3) : "none") + " (true " + Dtrue.toFixed(3) + (m.truth.walls ? " in the image plane" : "") + "), D_R " + (dR !== null ? r.rot.D_r_s.toFixed(3) : "none") + " (true " + m.truth.D_r_s.toFixed(3) + "); movie " + (t1 - t0) + " ms, analysis " + (t2 - t1) + " ms";
  if (tolR === null) { console.log("info " + msg); return; }
  check(msg, dT !== null && Math.abs(dT) < tolT && dR !== null && Math.abs(dR) < tolR);
}
runRot("birefringent spheres (RM257-like, 370 nm, dn 0.1), polariser and analyser at 75 deg (p-DDM)", { shape: "bisphere", birefringence: 0.1, polarization: { polarizer_deg: 90, analyzer_deg: 15, extinction: 1e-4 }, seed: 4 }, 0.08, 0.2);
runRot("birefringent spheres, crossed polarisers, three-mode fit (adds the 20 D_R mode of the depolarised light)", { shape: "bisphere", birefringence: 0.1, polarization: { polarizer_deg: 0, analyzer_deg: 90, extinction: 1e-4 }, seed: 1, fit_model: "three" }, 0.08, 0.25);
runRot("E. coli-like rods (2 x 0.8 um) in poor man's dark field (Ph3, 10x NA 0.25)", { shape: "rod", aspect: 2.5, diameter_um: 2.0, particle: "bacterium", objective: { mag: 10, na: 0.25 }, illum: { na_in: 0.42, na_out: 0.50 }, liquid: { n: 1.345, viscosity_mPa_s: 1.87 }, T_C: 24, n_px: 128, n_frames: 512, frame_rate_hz: 20, exposure_s: 0.005, volume_fraction: 4e-4, seed: 2 }, 0.12, 0.35);
runRot("peanut-like silica prolates (1.72 um, p 2.3) settled in a 1 um layer, bright field 40x, squared gradient (SG-DDM)", { shape: "prolate", aspect: 2.3, diameter_um: 1.72, particle: "silica", source: "green", objective: { mag: 40, na: 0.6 }, illum: { na_in: 0, na_out: 0.52 }, T_C: 22, n_px: 128, n_frames: 512, frame_rate_hz: 25, exposure_s: 0.002, volume_fraction: 2.5e-2, cell_um: 1, focus_um: 1.0, images: "squared_gradient" }, 0.15, 0.25);
runRot("peanuts settled by gravity in a 5 um cell, slower near the glass, focus 0.6 um above the bottom (SG-DDM, info)", { shape: "prolate", aspect: 2.3, diameter_um: 1.72, particle: "silica", source: "green", objective: { mag: 40, na: 0.6 }, illum: { na_in: 0, na_out: 0.52 }, T_C: 22, n_px: 128, n_frames: 512, frame_rate_hz: 25, exposure_s: 0.002, volume_fraction: 5e-3, cell_um: 5, focus_um: 0.6, gravity: true, walls: true, images: "squared_gradient" }, 0.15, null);
{
  // birefringent spheres without polarizers: their weak tilt dependence must not be reported as a rotation
  // (a slight bend of the curves passed the misfit test alone; the fast mode must also appear at many single q)
  const m = DDM.runToEnd(MOVIE.simulate({ seed: 1, mode: "brightfield", objective: { mag: 20, na: 0.4 }, illum: { na_in: 0, na_out: 0.3 }, source: "halogen", homodyne: true, light_frac: 0.5, df_light_e: 1e7, stray_frac: 1e-4,
    detector: { kind: "camera", pixel_um: 6.5, binning: 2, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "rolling_center", t_row_s: 1 / (100 * 1024), rows_total: 256, crop_row0: 64 },
    n_px: 64, n_frames: 2048, frame_rate_hz: 800, exposure_s: 0.0012, particle: "rm257", shape: "bisphere", birefringence: 0.1, diameter_um: 0.37, size_spread: 0, volume_fraction: 4e-5, liquid: { glycerol_w: 0 }, T_C: 20, cell_um: 50, focus_um: 25, drift_um_s: 0 }));
  const r = DDM.runToEnd(DDM.analyse(m, { fit_model: "two", q_min_per_um: null, q_max_per_um: null }));
  check("birefringent spheres without polarizers: no spurious rotation", r.rot === null || r.rot.D_r_s === null, r.rot ? r.rot.reason || ("D_R " + r.rot.D_r_s) : "");
}
{
  // spheres without anisotropy: no second mode
  const m = DDM.runToEnd(MOVIE.simulate({ seed: 1, mode: "brightfield", objective: { mag: 20, na: 0.5 }, illum: { na_in: 0, na_out: 0.3 }, source: "green", homodyne: false, light_frac: 0.5, detector: orca(1), n_px: 128, n_frames: 256, frame_rate_hz: 100, exposure_s: 0, particle: "ps", diameter_um: 0.2, size_spread: 0, volume_fraction: 2e-4, liquid: { glycerol_w: 0 }, T_C: 22, cell_um: 20, focus_um: 10, drift_um_s: 0 }));
  const r = DDM.runToEnd(DDM.analyse(m, { fit_model: "two", q_min_per_um: null, q_max_per_um: null }));
  check("isotropic spheres analysed with two modes: no rotation found, size kept", (r.rot === null || r.rot.D_r_s === null) && r.diameter_um !== null && Math.abs(r.diameter_um / 0.2 - 1) < 0.08, (r.rot ? r.rot.reason : "") + ", " + Math.round(r.diameter_um * 1000) + " nm");
}

console.log(failures === 0 ? "\nALL MOVIE CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
