// Checks of the swimmers in movie.js: speeds, straight runs, plane swimmers, tumbles, walls
const MOVIE = require("./movie.js"), DDM = require("./ddm-engine.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
function base(over) {
  return Object.assign({
    seed: 3, mode: "fluorescence", objective: { mag: 20, na: 0.5 }, l_ex_um: 0.488, l_em_um: 0.52, photons_per_particle: 2000, background_photons: 10,
    detector: { kind: "camera", pixel_um: 6.5, binning: 1, bin_charge: false, qe: 0.8, read_noise_e: 1.6, full_well_e: 30000, timing: "global", t_row_s: 0, rows_total: 64, crop_row0: 0 },
    n_px: 64, n_frames: 200, frame_rate_hz: 50, exposure_s: 0, particle: "ps", diameter_um: 1.0, size_spread: 0, volume_fraction: 2e-3,
    liquid: { glycerol_w: 0 }, T_C: 22, cell_um: 40, focus_um: 20, drift_um_s: 0, vector: false, test_track: true
  }, over);
}
function unwrap(tr, i, T) {   // unwrapped positions of tracked particle i
  const x = [], y = [], h = []; let ox = 0, oy = 0;
  for (let t = 0; t < T; t++) {
    const o = t * tr.n + i; let X = tr.X[o], Y = tr.Y[o];
    if (t > 0) { const px = tr.X[o - tr.n], py = tr.Y[o - tr.n]; if (X - px > tr.L / 2) ox -= tr.L; if (X - px < -tr.L / 2) ox += tr.L; if (Y - py > tr.L / 2) oy -= tr.L; if (Y - py < -tr.L / 2) oy += tr.L; }
    x.push(X + ox); y.push(Y + oy); h.push(tr.H[o]);
  }
  return { x, y, h };
}

// 1. straight runs in 3D: speed from end-to-end distance (Brownian part small over 1 s at 20 um/s), in-plane mean pi/4 of it
{
  const m = DDM.runToEnd(MOVIE.simulate(base({ swim: { fraction: 1, v_um_s: 20, v_spread: 0.3, rot_diff_s: 0 }, cell_um: 400, focus_um: 200 })));
  const tr = m.test_track, T = m.T, dt = 1 / m.frame_rate_hz, nT = 50;
  const devs = []; let ratio = 0, n = 0;
  for (let i = 0; i < tr.n; i++) {
    const u = unwrap(tr, i, T), dx = u.x[nT] - u.x[0], dy = u.y[nT] - u.y[0], dh = u.h[nT] - u.h[0];
    if (u.h.slice(0, nT + 1).some(function (v) { return v < 2 || v > 398; })) continue;   // skip wall hits
    const v3 = Math.hypot(dx, dy, dh) / (nT * dt);
    // squared path speed minus the Brownian part 6 D / t over the run
    devs.push(Math.sqrt(Math.max(0, v3 * v3 - 6 * m.truth.D_um2_s / (nT * dt))) / tr.SP[i] - 1); ratio += Math.hypot(dx, dy) / (nT * dt) / tr.SP[i]; n++;
  }
  ratio /= n;
  devs.sort(function (a, b) { return a - b; });
  const med = devs[Math.floor(devs.length / 2)], mean = devs.reduce(function (a, b) { return a + b; }, 0) / devs.length;
  check("3D straight runs: speed along the path equals the drawn speed (" + n + " swimmers)", Math.abs(med) < 0.01 && Math.abs(mean) < 0.02, "median deviation " + (100 * med).toFixed(2) + " %, mean " + (100 * mean).toFixed(2) + " %");
  check("3D straight runs: mean in-plane speed is pi/4 of the speed", Math.abs(ratio / (Math.PI / 4) - 1) < 0.06, "ratio " + ratio.toFixed(3) + " (pi/4 = 0.785)");
  const s = m.truth.swim;
  check("speeds: mean and spread of the drawn Schulz distribution", Math.abs(s.v_mean_um_s / 20 - 1) < 0.05 && Math.abs(s.v_sd_um_s / s.v_mean_um_s / 0.3 - 1) < 0.15, "mean " + s.v_mean_um_s.toFixed(2) + " um/s, relative SD " + (s.v_sd_um_s / s.v_mean_um_s).toFixed(3) + " (" + s.n_swimmers + " swimmers)");
}
// 2. fraction that swims, plane swimmers keep their height and swim at their full speed in the plane
{
  const m = DDM.runToEnd(MOVIE.simulate(base({ swim: { fraction: 0.6, v_um_s: 15, v_spread: 0, plane_fraction: 1, height_um: 1.0, rot_diff_s: 0.2 }, cell_um: 20, volume_fraction: 1e-2 })));
  const s = m.truth.swim, tr = m.test_track, T = m.T, dt = 1 / m.frame_rate_hz;
  check("fraction that swims", Math.abs(s.fraction - 0.6) < 0.06, s.fraction.toFixed(3) + " of " + m.info.n_particles);
  let hOk = true, vbar = 0, n = 0;
  for (let i = 0; i < tr.n; i++) {
    if (!tr.PL[i]) continue;
    const u = unwrap(tr, i, T);
    for (let t = 0; t < T; t++) if (Math.abs(u.h[t] - 1.0) > 1e-9) hOk = false;
    for (let t = 1; t < T; t++) { vbar += (Math.pow(u.x[t] - u.x[t - 1], 2) + Math.pow(u.y[t] - u.y[t - 1], 2)) / (dt * dt); n++; }
  }
  vbar = Math.sqrt(Math.max(0, vbar / n - 4 * m.truth.D_um2_s / dt));     // mean squared step minus the Brownian 4 D dt
  check("plane swimmers stay at their height", hOk);
  check("plane swimmers move at their speed within the plane", Math.abs(vbar / 15 - 1) < 0.05, "speed from the mean squared step " + vbar.toFixed(2) + " um/s");
}
// 3. tumbles: in-plane mean squared displacement of 3D run-and-tumble swimmers (Brownian part included)
{
  const lam = 2, v = 20;
  const m = DDM.runToEnd(MOVIE.simulate(base({ swim: { fraction: 1, v_um_s: v, v_spread: 0, rot_diff_s: 0, tumble_hz: lam }, cell_um: 400, focus_um: 200, n_frames: 300, frame_rate_hz: 20 })));
  const tr = m.test_track, T = m.T, dt = 1 / m.frame_rate_hz, Dt = m.truth.D_um2_s;
  let worst = 0; const out = [];
  for (const lag of [2, 10, 40]) {
    let s = 0, n = 0;
    for (let i = 0; i < tr.n; i++) { const u = unwrap(tr, i, T); for (let t = 0; t + lag < T; t += 5) { s += Math.pow(u.x[t + lag] - u.x[t], 2) + Math.pow(u.y[t + lag] - u.y[t], 2); n++; } }
    const tt = lag * dt, theory = 2 / 3 * 2 * v * v / (lam * lam) * (lam * tt - 1 + Math.exp(-lam * tt)) + 4 * Dt * tt;
    const r = s / n / theory; worst = Math.max(worst, Math.abs(r - 1)); out.push(lag + ": " + r.toFixed(3));
  }
  check("run-and-tumble: in-plane mean squared displacement matches theory", worst < 0.1, "measured / theory at lags " + out.join(", "));
}
// 4. walls: 3D swimmers in a thin cell stay inside
{
  const m = DDM.runToEnd(MOVIE.simulate(base({ swim: { fraction: 1, v_um_s: 40, v_spread: 0.2, rot_diff_s: 0 }, cell_um: 5, focus_um: 2.5, walls: true })));
  const tr = m.test_track; let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < tr.H.length; k++) { lo = Math.min(lo, tr.H[k]); hi = Math.max(hi, tr.H[k]); }
  check("walls: swimmers stay between the walls (keeping their radius)", lo >= 0.5 - 1e-9 && hi <= 4.5 + 1e-9, "heights " + lo.toFixed(3) + " to " + hi.toFixed(3) + " um");
}
// 4b. walls turn swimmers back: after many crossings the heights stay evenly spread (no pile-up at the walls)
{
  const m = DDM.runToEnd(MOVIE.simulate(base({ swim: { fraction: 1, v_um_s: 30, v_spread: 0.2, rot_diff_s: 0 }, cell_um: 20, focus_um: 10, walls: true, n_frames: 400, frame_rate_hz: 20 })));
  const tr = m.test_track, T = m.T; let mid = 0, n = 0;
  for (let t = T - 100; t < T; t++) for (let i = 0; i < tr.n; i++) { const h = tr.H[t * tr.n + i]; if (h > 5 && h < 15) mid++; n++; }
  check("walls: after many crossings half of the swimmers are in the middle half of the cell", Math.abs(mid / n - 0.5) < 0.06, (100 * mid / n).toFixed(1) + " % in the middle half");
}
// 4c. stroke: same mean paths as without it (its phases have their own random stream), different images, in the truth
{
  const a = DDM.runToEnd(MOVIE.simulate(base({ n_frames: 40, swim: { fraction: 1, v_um_s: 20, v_spread: 0, rot_diff_s: 0 } })));
  const b = DDM.runToEnd(MOVIE.simulate(base({ n_frames: 40, swim: { fraction: 1, v_um_s: 20, v_spread: 0, rot_diff_s: 0, osc_amp_um: 1, osc_hz: 10, osc_dir: "along" } })));
  let same = true; for (let k = 0; k < a.test_track.X.length; k += 7) if (a.test_track.X[k] !== b.test_track.X[k]) same = false;
  let diff = 0; for (let k = 0; k < a.frames.length; k += 13) diff += Math.abs(a.frames[k] - b.frames[k]);
  check("stroke: same mean paths, different images, recorded in the truth", same && diff > 0 && b.truth.swim.osc_amp_um === 1 && b.truth.swim.osc_hz === 10);
}
// 4d. log-spaced frames: cells are drawn at the frame times asked for (in-plane mean squared displacement 4 D t over
// short and long gaps)
{
  const m = DDM.runToEnd(MOVIE.simulate(base({ n_frames: 64, swim: { fraction: 0, v_um_s: 10, v_spread: 0 }, cell_um: 400, focus_um: 200, log_timing: { factor: 20 } })));
  const tr = m.test_track, T = m.T, tt = m.times_s, Dt = m.truth.D_um2_s;
  let worst = 0; const out = [];
  for (const [a, b] of [[0, 1], [10, 15], [0, 16], [0, 32]]) {     // pairs of frames inside one cycle of 16 and across cycles
    let sq = 0, n = 0; const dtk = tt[b] - tt[a];
    for (let i = 0; i < tr.n; i++) { const u = unwrap(tr, i, T); for (let c = 0; c + b < T; c += 16) { sq += Math.pow(u.x[c + b] - u.x[c + a], 2) + Math.pow(u.y[c + b] - u.y[c + a], 2); n++; } }
    const r = sq / n / (4 * Dt * dtk); worst = Math.max(worst, Math.abs(r - 1)); out.push(fmtS(dtk) + ": " + r.toFixed(3));
  }
  check("log-spaced frames: cells are drawn at the frame times (in-plane mean squared displacement 4 D t)", m.times_s && worst < 0.08, "measured / theory at delays " + out.join(", "));
}
function fmtS(t) { return t.toFixed(2) + " s"; }
// 5. fraction 0
{
  const a = DDM.runToEnd(MOVIE.simulate(base({ test_track: false, n_frames: 20 })));
  const b = DDM.runToEnd(MOVIE.simulate(base({ test_track: false, n_frames: 20, swim: { fraction: 0, v_um_s: 10, v_spread: 0 } })));
  let same = a.frames.length === b.frames.length; for (let k = 0; same && k < a.frames.length; k += 97) if (a.frames[k] !== b.frames[k]) same = false;
  check("fraction 0: no swimmers", b.truth.swim.n_swimmers === 0);
}
console.log(failures === 0 ? "\nALL SWIM CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
