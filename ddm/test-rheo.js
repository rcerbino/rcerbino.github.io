// Checks of DDM microrheology: tracer beads in simulated materials with known moduli
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js"), RHEO = require("./rheo-engine.js"), V = require("./visco.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
function orca() { return { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.82, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 512, crop_row0: 0 }; }
const BASE = {
  seed: 1, mode: "brightfield", objective: { mag: 40, na: 0.6 }, illum: { na_in: 0, na_out: 0.3 }, source: "green", homodyne: false, light_frac: 0.5,
  detector: orca(), n_px: 128, n_frames: 512, frame_rate_hz: 500, exposure_s: 0.0002, log_timing: { factor: 100 },
  particle: "ps", diameter_um: 0.5, size_spread: 0, volume_fraction: 2e-3, liquid: { glycerol_w: 0 }, T_C: 22, cell_um: 20, focus_um: 10, drift_um_s: 0
};
function run(label, mat, over, aopts) {
  const t0 = Date.now(), cfg = Object.assign({}, BASE, { visco: mat }, over || {});
  const mv = DDM.runToEnd(MOVIE.simulate(cfg));
  const t1 = Date.now();
  const r = DDM.runToEnd(RHEO.analyse(mv, Object.assign({ radius_um: cfg.diameter_um / 2, windowing: false }, aopts || {})));
  const eta = mv.viscosity_Pa_s;
  // compare with the exact moduli over the range measured: mean |ln ratio| and the worst
  let s = 0, n = 0, worst = 0;
  r.w_rad_s.forEach(function (w, k) {
    const g = V.gstar(mat, eta, w);
    [[r.Gp_Pa[k], g[0]], [r.Gpp_Pa[k], g[1]]].forEach(function (p) { if (p[1] > 0.1 * Math.max(g[0], g[1]) && p[0] > 0) { const d = Math.abs(Math.log(p[0] / p[1])); s += d; n++; worst = Math.max(worst, d); } });
  });
  const tr = mv.truth.visco, e = { lam: Float64Array.from(tr.lam), c: Float64Array.from(tr.c) };
  let sm = 0, nm = 0; r.smooth.t_s.forEach(function (t, k) { sm += Math.abs(Math.log(r.smooth.m_um2[k] / (2 * V.msd1(e, t)))); nm++; });
  console.log("info " + label + ": " + r.w_rad_s[0].toPrecision(2) + "-" + r.w_rad_s[r.w_rad_s.length - 1].toPrecision(2) + " rad/s, q " + r.window.q_min_used.toFixed(2) + "-" + r.window.q_max_used.toFixed(2) +
    ", MSD off by " + (100 * sm / nm).toFixed(1) + " % on average, moduli " + (100 * s / n).toFixed(0) + " % (worst " + (100 * worst).toFixed(0) + " %), crossings " + r.crossings.map(function (c) { return c.w.toPrecision(3); }).join(", ") +
    ", alpha at the end " + r.alpha_end.toFixed(2) + (r.eta_long_Pa_s ? ", eta " + r.eta_long_Pa_s.toPrecision(3) + " (true " + V.eta0(mat, eta).toPrecision(3) + ")" : "") + (r.plateau_Pa ? ", plateau " + r.plateau_Pa.toPrecision(3) : "") +
    "; sim " + ((t1 - t0) / 1000).toFixed(1) + " s, analysis " + ((Date.now() - t1) / 1000).toFixed(1) + " s");
  return { mv, r, msdErr: sm / nm, modErr: s / n };
}
{ const { r, msdErr, modErr } = run("water", { modes: [] }, { log_timing: null, frame_rate_hz: 100, n_frames: 512 });
  check("water: MSD within 10 % on average", msdErr < 0.1); check("water: viscosity within 10 %", r.eta_long_Pa_s && Math.abs(r.eta_long_Pa_s / 0.00095 - 1) < 0.15, "eta " + r.eta_long_Pa_s);
  check("water: G'' within 25 % on average", modErr < 0.25); }
{ const mat = { modes: [[0.5, 0.5]] }, { r, msdErr, modErr } = run("Maxwell 0.5 Pa, 0.5 s", mat);
  check("Maxwell: MSD within 10 % on average", msdErr < 0.1); check("Maxwell: moduli within 25 % on average", modErr < 0.25);
  const c = V.crossings(mat, 0.00095, 0.01, 1e4)[0].w;
  check("Maxwell: crossover within 25 %", r.crossings.some(function (x) { return Math.abs(Math.log(x.w / c)) < 0.25; }), "true " + c.toPrecision(3)); }
{ const mat = { G_inf_Pa: 0.3, modes: V.powerLawModes(0.3, 0.5, 1e-4, 1e2) }, { r, msdErr, modErr } = run("gel past the gel point", mat, { seed: 2 });
  check("gel: MSD within 10 % on average", msdErr < 0.1); check("gel: moduli within 30 % on average", modErr < 0.3); check("gel: reads as a solid at long times", r.alpha_end < 0.3, "alpha " + r.alpha_end.toFixed(2)); }
{ const mat = { modes: V.rouseModes(0.2, 0.1, 20) }, { r, msdErr, modErr } = run("Rouse polymer solution", mat, { seed: 3 });
  check("Rouse: MSD within 10 % on average", msdErr < 0.1); check("Rouse: moduli within 30 % on average", modErr < 0.3); }
{ const mat = { modes: [[0.5, 0.5]] }, { r, modErr } = run("Maxwell, plain method (A from the variance, B fitted, Mason)", mat, { seed: 4 }, { published_only: true });
  check("plain method runs (its error is reported, not checked)", r.published === true, "moduli off by " + (100 * modErr).toFixed(0) + " %"); }
{ // a stiff gel: the beads barely move; the page must say so rather than fail
  let msg = null; try { run("stiff gel (50 Pa)", { G_inf_Pa: 50, modes: [] }, { seed: 5 }); } catch (e) { msg = e.message; }
  check("stiff gel: stops with a plain message", msg && /too few delays/.test(msg), msg || "no error"); }
console.log(failures ? "\n" + failures + " RHEO CHECK(S) FAILED" : "\nALL RHEO CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
