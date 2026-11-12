// Checks of the swimmer analysis (active-engine.js): model functions, inversion, fits on synthetic data and on simulated movies
const A = require("./active-engine.js"), MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
function lgamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
function schulz(u, Z) { return Math.exp((Z + 1) * Math.log(Z + 1) + Z * Math.log(u) - (Z + 1) * u - lgamma(Z + 1)); }   // mean 1
function avg(kern, X, Z) { const n = 40000, umax = 1 + 12 / Math.sqrt(Z + 1); let s = 0; for (let i = 1; i <= n; i++) { const u = i * umax / n; s += schulz(u, Z) * kern(X * u); } return s * umax / n; }
// 1. model functions against direct averages over the speeds
{
  let w3 = 0, w2 = 0;
  for (const Z of [1, 3, 10, 50]) for (const X of [0.3, 1, 3, 8, 20]) {
    w3 = Math.max(w3, Math.abs(A.swim3(X, Z) - avg(function (x) { return Math.sin(x) / x; }, X, Z)));
    w2 = Math.max(w2, Math.abs(A.swim2(X, Z) - avg(A.besselJ0, X, Z)));
  }
  check("3D swimmer factor (closed form) equals the average of sin(x)/x over Schulz speeds", w3 < 1e-4, "largest difference " + w3.toExponential(1));
  check("2D swimmer factor (Gauss-Laguerre) equals the average of J0 over Schulz speeds", w2 < 2e-3, "largest difference " + w2.toExponential(1));
}
// 1b. stroke models against Monte Carlo averages over speed, direction, phase (and the stroke direction about the path)
{
  const g = function () { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
  const gam = function (k) { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, w; do { x = g(); w = 1 + c * x; } while (w <= 0); w = w * w * w; if (Math.log(Math.random()) < 0.5 * x * x + d * (1 - w + Math.log(w))) return d * w; } };
  let worst = 0;
  for (const across of [false, true]) for (const q of [0.2, 0.8]) for (const t of [0.004, 0.012, 0.05]) {
    const sp = 0.3, k = 1 / (sp * sp), vm = 90, Am = 2, f = 40, N = 120000; let s = 0;
    for (let i = 0; i < N; i++) {
      const v = vm * gam(k) / k, mu = 2 * Math.random() - 1, ph = 2 * Math.PI * Math.random(), sv = Am * (Math.sin(2 * Math.PI * f * t + ph) - Math.sin(ph));
      // along: q.u = q mu; across: q.e = q sqrt(1 - mu^2) cos(psi)
      const qe = across ? q * Math.sqrt(1 - mu * mu) * Math.cos(2 * Math.PI * Math.random()) : q * mu;
      s += Math.cos(q * mu * v * t + qe * sv);
    }
    worst = Math.max(worst, Math.abs(s / N - A.swimF(across ? "strokex" : "stroke", q, t, { v: vm, alpha: 1, spread: sp, D: 0, A: Am, f: f })));
  }
  check("stroke models (along and across the path) equal Monte Carlo averages", worst < 0.01, "largest difference " + worst.toFixed(4));
}
// 2. inversion of a known f(x): Schulz speeds (Z = 8, mean 20 um/s) in 3D and in 2D
for (const kind of ["3d", "2d"]) {
  const Z = 8, vm = 20, vg = []; for (let k = 1; k <= 60; k++) vg.push(k);
  const P = A.invertCurve(function (x) { return kind === "3d" ? A.swim3(x * vm, Z) : A.swim2(x * vm, Z); }, kind, vg);
  let worst = 0, pk = 0; vg.forEach(function (v, i) { const tr = schulz(v / vm, Z) / vm; pk = Math.max(pk, tr); worst = Math.max(worst, Math.abs(P[i] - tr)); });
  check("inversion recovers the speed distribution (" + kind + ")", worst < 0.03 * pk, "largest difference " + (100 * worst / pk).toFixed(2) + " % of the peak");
}
// 3. global fit on synthetic structure functions (noise 1 %)
{
  const taus = DDM.logspaceLags(500, 40).map(function (m) { return m / 100; }), rng = DDM._test.makeRng(5);
  for (const kind of ["3d", "2d"]) {
    const truth = { v: 18, alpha: 0.7, spread: 0.35, D: 0.4 }, rows = [];
    for (let q = 0.5; q <= 3.01; q += 0.25) {
      const Aq = 1000 / q, Bq = 100, y = new Float64Array(taus.length);
      for (let i = 0; i < taus.length; i++) y[i] = Aq * (1 - A.swimF(kind, q, taus[i], truth)) + Bq + 0.01 * (Aq + Bq) * rng.gauss();
      rows.push({ q: q, y: y, A: Aq, B: Bq, scale: Aq + Bq });
    }
    const g = A.fitSwimGlobal(kind, taus, rows, { v: 25, alpha: 0.9, spread: 0.3, D: 0.3 }, {});
    check("global swimmer fit on synthetic data (" + kind + ")", Math.abs(g.v_um_s / 18 - 1) < 0.02 && Math.abs(g.alpha - 0.7) < 0.02 && Math.abs(g.spread - 0.35) < 0.03 && Math.abs(g.D_um2_s / 0.4 - 1) < 0.1,
      "v " + g.v_um_s.toFixed(2) + ", alpha " + g.alpha.toFixed(3) + ", spread " + g.spread.toFixed(3) + ", D " + g.D_um2_s.toFixed(3));
  }
}
// 4. simulated movies
function movieCase(label, over, opts, test) {
  const cfg = Object.assign({
    seed: 1, mode: "brightfield", objective: { mag: 10, na: 0.3 }, illum: { na_in: 0.09, na_out: 0.12 }, pupil: { kind: "phase", ring_in: 0.09, ring_out: 0.12, amp: 0.25, phase: -Math.PI / 2 }, source: "halogen", homodyne: true, light_frac: 0.5, df_light_e: 1e7, stray_frac: 1e-4,
    detector: { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.8, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 128, crop_row0: 0 },
    n_px: 128, n_frames: 256, frame_rate_hz: 50, exposure_s: 0.001, shape: "rod", aspect: 2.5, diameter_um: 2.0, particle: "bacterium", size_spread: 0, volume_fraction: 1e-3,
    liquid: { n: 1.335, viscosity_mPa_s: 0.95 }, T_C: 22, cell_um: 50, focus_um: 25, drift_um_s: 0
  }, over);
  const t0 = Date.now(), m = DDM.runToEnd(MOVIE.simulate(cfg)), t1 = Date.now();
  const r = DDM.runToEnd(A.analyse(m, Object.assign({ q_min_per_um: null, q_max_per_um: null, beta: null, kind: "3d", D_from_cells: true }, opts))), t2 = Date.now();
  const s = Object.assign({}, m.truth.swim), sw = r.swim, c = r.compressed;
  const so = A.seenOver(s, r.rows.filter(function (x) { return !x.reason; }).map(function (x) { return x.q_per_um; }));
  if (so) { s.fraction_seen = so.fraction; s.v_mean_seen_um_s = so.v_mean_um_s; }
  const msg = label + ": " + m.info.n_particles + " cells; true v " + s.v_mean_um_s.toFixed(1) + " (SD " + (s.v_sd_um_s / s.v_mean_um_s).toFixed(2) + "), share " + s.fraction.toFixed(2) + " (seen " + (s.fraction_seen || 0).toFixed(2) + ", v seen " + (s.v_mean_seen_um_s || 0).toFixed(1) + ")" +
    "; model v " + (sw && sw.no_swim ? "no swimming found" : sw ? sw.v_um_s.toFixed(1) + " spread " + sw.spread.toFixed(2) + " share " + sw.alpha.toFixed(2) + " D " + sw.D_um2_s.toFixed(2) : "none") +
    "; compressed v0 " + (c ? c.v0_um_s.toFixed(1) + " slope " + c.slope.toFixed(2) + " beta " + c.beta_free_mean.toFixed(2) + " c " + c.intercept_hz.toFixed(1) : "none") + " (" + (c ? c.n_points : 0) + " q)" +
    (r.pv ? "; P(v) data: share still " + r.pv.data_still_share.toFixed(2) + ", mean " + (r.pv.data_mean_swimmers_um_s || 0).toFixed(1) : "") + "; movie " + (t1 - t0) + " ms, analysis " + (t2 - t1) + " ms";
  if (!test) { console.log("info " + msg); return { m, r }; }
  check(msg, test(m, r));
  return { m, r };
}
movieCase("E. coli-like motility assay, phase contrast 10x, 60 % swim at 20 um/s (spread 0.3)", { swim: { fraction: 0.6, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0.1 } }, {},
  function (m, r) { const s = m.truth.swim; return r.swim && Math.abs(r.swim.v_um_s / s.v_mean_um_s - 1) < 0.05 && Math.abs(r.swim.alpha - s.fraction_seen) < 0.06 && Math.abs(r.pv.data_still_share - (1 - s.fraction_seen)) < 0.06 && Math.abs(r.pv.data_mean_swimmers_um_s / s.v_mean_um_s - 1) < 0.08; });
movieCase("the same with log-spaced frames (movie 20 times longer)", { swim: { fraction: 0.6, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0.1 }, log_timing: { factor: 20 } }, {},
  function (m, r) { const s = m.truth.swim; return m.times_s && r.swim && !r.swim.no_swim && Math.abs(r.swim.v_um_s / s.v_mean_um_s - 1) < 0.08 && Math.abs(r.swim.alpha - s.fraction_seen) < 0.06 && r.taus_s[r.taus_s.length - 1] > 30; });
movieCase("plane swimmers (2D), dark field 10x, 80 % swim at 15 um/s, q up to 1.5 um^-1 (rod length 2 um)", { swim: { fraction: 0.8, v_um_s: 15, v_spread: 0.25, plane_fraction: 1, plane_still: true, height_um: 1, rot_diff_s: 0.1 }, n_frames: 512, illum: { na_in: 0.42, na_out: 0.5 }, pupil: undefined, cell_um: 20, focus_um: 1, volume_fraction: 2e-3 }, { kind: "2d", q_max_per_um: 1.5 },
  function (m, r) { const s = m.truth.swim; return r.swim && Math.abs(r.swim.v_um_s / s.v_mean_um_s - 1) < 0.05 && Math.abs(r.swim.alpha - s.fraction_seen) < 0.05; });
movieCase("no swimmers: still rods that turn are not taken for swimmers", { seed: 2, swim: { fraction: 0, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0.1 } }, { q_max_per_um: 1.5 },
  function (m, r) { return r.head && r.head.no_swim === true && r.head.alpha === 0; });
movieCase("all swim: the share is found (diffusion set from the cell size)", { seed: 3, swim: { fraction: 1, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0.1 } }, { q_max_per_um: 1.5 },
  function (m, r) { const s = m.truth.swim; return r.swim && r.swim.alpha > 0.95 && Math.abs(r.swim.v_um_s / s.v_mean_um_s - 1) < 0.05; });
// 4b. Chlamydomonas-like swimmers with a breaststroke: the stroke model finds speed, amplitude and frequency
{
  const cfg = { seed: 1, mode: "brightfield", objective: { mag: 4, na: 0.1 }, illum: { na_in: 0, na_out: 0.05 }, pupil: { kind: "none" }, source: "halogen", homodyne: true, light_frac: 0.5, df_light_e: 1e7, stray_frac: 1e-4,
    detector: { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.8, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 128, crop_row0: 0 },
    n_px: 128, n_frames: 512, frame_rate_hz: 500, exposure_s: 0.0005, shape: "sphere", diameter_um: 10, particle: "bacterium", size_spread: 0, volume_fraction: 0.02,
    liquid: { n: 1.335, viscosity_mPa_s: 0.95 }, T_C: 22, cell_um: 100, focus_um: 50, drift_um_s: 0,
    swim: { fraction: 0.9, v_um_s: 89.6, v_spread: 0.28, rot_diff_s: 0.2, osc_amp_um: 0.98, osc_hz: 48.6, osc_dir: "along" } };
  const m = DDM.runToEnd(MOVIE.simulate(cfg)), r = DDM.runToEnd(A.analyse(m, { stroke: true, D_from_cells: true })), st = r.swim_stroke, tv = m.truth.swim.v_mean_um_s;
  check("breaststroke (Chlamydomonas-like): speed within 5 %, stroke within 10 %, beat within 2 %", st && Math.abs(st.v_um_s / tv - 1) < 0.05 && Math.abs(st.stroke_um / 0.98 - 1) < 0.1 && Math.abs(st.stroke_hz / 48.6 - 1) < 0.02,
    st ? "v " + st.v_um_s.toFixed(1) + " (true " + tv.toFixed(1) + "), A " + st.stroke_um.toFixed(2) + " um, f " + st.stroke_hz.toFixed(1) + " Hz; Wilson's model v " + r.swim.v_um_s.toFixed(1) : "no stroke fit");
}
// 5. confocal (spinning disk, 20x NA 0.75): swimmers leave the thin slice. Wilson's model reads the speed high, the
// model with the depth response of the microscope gets it right
{
  const cfg = { seed: 1, mode: "spinning", objective: { mag: 20, na: 0.75, n_imm: 1.0 }, l_ex_um: 0.488, l_em_um: 0.52, pinhole_um: 50, crosstalk: Math.PI / 4 * 0.04, photons_per_particle: 3000, background_photons: 5,
    detector: { kind: "camera", pixel_um: 6.5, binning: 2, bin_charge: false, qe: 0.8, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 256, crop_row0: 0 },
    n_px: 128, n_frames: 512, frame_rate_hz: 100, exposure_s: 0.002, shape: "sphere", diameter_um: 1.0, particle: "bacterium", size_spread: 0, volume_fraction: 4e-4,
    liquid: { n: 1.335, viscosity_mPa_s: 0.95 }, T_C: 22, cell_um: 50, focus_um: 25, drift_um_s: 0, vector: false, swim: { fraction: 0.6, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0.1 } };
  const t0 = Date.now(), m = DDM.runToEnd(MOVIE.simulate(cfg)), r = DDM.runToEnd(A.analyse(m, { q_min_per_um: null, q_max_per_um: null, beta: null, kind: "3d", depth: true }));
  const so = A.seenOver(m.truth.swim, r.fits.filter(function (f) { return f.reason === null; }).map(function (f) { return f.q_per_um; }));
  const dw = r.swim.v_um_s / so.v_mean_um_s - 1, dd = r.swim_depth.v_um_s / so.v_mean_um_s - 1;
  check("spinning disk 20x: Wilson's model reads high (" + (100 * dw).toFixed(0) + " %), the depth model within 4 % (" + (100 * dd).toFixed(1) + " %)", dw > 0.05 && Math.abs(dd) < 0.04, "true " + so.v_mean_um_s.toFixed(1) + " um/s; " + (Date.now() - t0) + " ms");
}
console.log(failures === 0 ? "\nALL SWIMMER ANALYSIS CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
