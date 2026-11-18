/* DDM of a confluent cell monolayer: how far the cells wander, and whether the sheet moves as a flock.
 *
 * Steps:
 *   1. structure function d(q, dt) of the movie as recorded (the lab frame), with A = 2 <|F|^2> - B and B from the camera;
 *   2. the motion of the whole sheet, from the phase of the widest patterns between consecutive frames (phase
 *      differential microscopy, phiDM: Colin, Zhang and Wilson 2014): a sheet displaced by R turns the phase of pattern q by
 *      -q.R. The steps of R are summed, and the flock velocity V is the slope of a straight line through R(t);
 *   3. every frame moved back by R(t) in Fourier space (F(q, t) exp(i q.R(t))), and the structure function again: the
 *      motion of the cells relative to the sheet (opts.comoving false or opts.published_only: lab frame only);
 *   4. the mean squared displacement from f = 1 - (d - B) / A at each q of a band, inverted as a Gaussian,
 *      <dr^2> = -4 ln f / q^2 (Giavazzi et al., Front. Phys. 6, 120, 2018), where 0.1 < f < 0.95, combined over q by the mean
 *      of ln; the band starts at the peak of A(q) (the spacing of neighbouring nuclei), where the nuclei add up like
 *      independent spots, and ends where the signal falls to three times the noise;
 *   5. order: psi = |V| / v, with v the mean speed of a cell from the lab-frame displacement over the shortest delay;
 *      the state: a flock when psi > 0.5, solid when the displacement relative to the sheet stays below a tenth of a cell
 *      area over the movie and grows ever more slowly.
 * Times are in hours: the movie's frame_rate_hz is frames per hour.
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  function need(c, m) { if (!c) throw new Error("Tissue analysis: " + m); }

  function cameraB(movie) { const F = movie.frames, r2 = movie.info.read_noise_e * movie.info.read_noise_e; let s = 0; for (let k = 0; k < F.length; k++) s += F[k]; return 2 * (s / F.length + r2); }
  // displacement of the whole sheet between consecutive frames, from the phase of the widest patterns
  function sheetMotion(movie) {
    const n = movie.n, P = n * n, T = movie.T, fft = movie.fft, dq = 2 * Math.PI / movie.L_um, K = 4;
    const R = [[0, 0]], steps = [];
    for (let t = 0; t + 1 < T; t++) {
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (let ky = -K; ky <= K; ky++) for (let kx = 0; kx <= K; kx++) {
        if (kx === 0 && ky <= 0) continue;
        const p = ((ky + n) % n) * n + kx, o1 = 2 * (t * P + p), o2 = 2 * ((t + 1) * P + p);
        const cr = fft[o2] * fft[o1] + fft[o2 + 1] * fft[o1 + 1], ci = fft[o2 + 1] * fft[o1] - fft[o2] * fft[o1 + 1];
        const w = Math.hypot(cr, ci), phs = Math.atan2(ci, cr), qx = kx * dq, qy = ky * dq;
        // -phase = q . dR, weighted by the strength of the pattern
        a11 += w * qx * qx; a12 += w * qx * qy; a22 += w * qy * qy; b1 += -w * qx * phs; b2 += -w * qy * phs;
      }
      const det = a11 * a22 - a12 * a12, sx = det > 0 ? (a22 * b1 - a12 * b2) / det : 0, sy = det > 0 ? (a11 * b2 - a12 * b1) / det : 0;
      steps.push([sx, sy]); R.push([R[t][0] + sx, R[t][1] + sy]);
    }
    const dt = 1 / movie.frame_rate_hz, ts = R.map(function (r, i) { return i * dt; });
    const fit = function (c) { let st = 0, sv = 0, stt = 0, stv = 0; ts.forEach(function (t, i) { st += t; sv += R[i][c]; stt += t * t; stv += t * R[i][c]; }); const m = ts.length; return (m * stv - st * sv) / (m * stt - st * st); };
    const V = [fit(0), fit(1)];
    // uncertainty of V from the scatter of the steps about the mean step (independent steps)
    let s2 = 0; steps.forEach(function (s) { s2 += Math.pow(s[0] - V[0] * dt, 2) + Math.pow(s[1] - V[1] * dt, 2); });
    const Verr = Math.sqrt(s2 / (2 * Math.max(1, steps.length - 1))) / dt / Math.sqrt(steps.length);
    return { R: R, V: V, V_err: Verr };
  }
  function comoving(movie, R) {
    const n = movie.n, P = n * n, T = movie.T, fft = movie.fft, out = new Float64Array(fft.length), dq = 2 * Math.PI / movie.L_um;
    const qx = new Float64Array(P), qy = new Float64Array(P);
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) { qx[iy * n + ix] = (ix < n / 2 ? ix : ix - n) * dq; qy[iy * n + ix] = (iy < n / 2 ? iy : iy - n) * dq; }
    for (let t = 0; t < T; t++) {
      const rx = R[t][0], ry = R[t][1], o = 2 * t * P;
      for (let p = 0; p < P; p++) { const ph = qx[p] * rx + qy[p] * ry, c = Math.cos(ph), s = Math.sin(ph), re = fft[o + 2 * p], im = fft[o + 2 * p + 1]; out[o + 2 * p] = re * c - im * s; out[o + 2 * p + 1] = re * s + im * c; }
    }
    return Object.assign({}, movie, { fft: out });
  }
  // mean squared displacement from f over a band of q
  function msdFrom(S, A, B, bLo, bHi) {
    const L = S.lags.length, out = [];
    for (let li = 0; li < L; li++) {
      let s = 0, c = 0;
      for (let b = bLo; b <= bHi; b++) { if (!(A[b] > 0)) continue; const f = 1 - (S.dq[li][b] - B) / A[b]; if (f > 0.1 && f < 0.95) { s += Math.log(-4 * Math.log(f) / (S.q_per_um[b] * S.q_per_um[b])); c++; } }
      out.push(c >= 2 ? Math.exp(s / c) : null);
    }
    return out;
  }
  function* analyse(movie, opts) {
    opts = opts || {};
    const pub = opts.published_only === true, useCM = !pub && opts.comoving !== false;
    const Slab = yield* DDM.structure(movie, {});
    const B = cameraB(movie), nb = Slab.nb, A = new Float64Array(nb + 1);
    for (let b = 1; b <= nb; b++) A[b] = 2 * Slab.powq[b] - B;
    const motion = sheetMotion(movie);
    yield { stage: "Following the sheet", frac: 0.5 };
    const Scm = useCM ? yield* DDM.structure(comoving(movie, motion.R), {}) : Slab;
    // the band of q: from the peak of A (at least the third bin) to where A falls to ten times B, and below the q range asked
    const qlo = opts.q_min_per_um > 0 ? opts.q_min_per_um : 0, qhi = opts.q_max_per_um > 0 ? opts.q_max_per_um : Infinity;
    let bPeak = 3; for (let b = 3; b <= nb; b++) if (A[b] > A[bPeak]) bPeak = b;
    // the band starts a little above the peak, where the arrangement of neighbours no longer slows the patterns (S(q) near 1)
    const bStart = Math.min(nb - 2, Math.round(1.3 * bPeak));
    let bHi = bStart; while (bHi < nb && A[bHi + 1] > 3 * B && Slab.q_per_um[bHi + 1] < (movie.q_signal_max_per_um || Infinity)) bHi++;
    let bLo = bStart; while (bLo < bHi && Slab.q_per_um[bLo] < qlo) bLo++;
    while (bHi > bLo && Slab.q_per_um[bHi] > qhi) bHi--;
    const msd = msdFrom(Scm, A, B, bLo, bHi), msdLab = msdFrom(Slab, A, B, bLo, bHi);
    // the same at each q, for the chart of step 5
    const rows = [];
    for (let b = 2; b <= nb; b++) rows.push({ b: b, q_per_um: Slab.q_per_um[b], A: A[b], B: B, used: b >= bLo && b <= bHi, f_lab: Slab.dq.map(function (d) { return 1 - (d[b] - B) / A[b]; }), f: Scm.dq.map(function (d) { return 1 - (d[b] - B) / A[b]; }) });
    // speed of a cell and order of the sheet
    // order: the share of the lab-frame displacement that the sheet's motion explains, at the shortest delay where it is
    // measured: psi^2 = V^2 dt^2 / <dr^2>_lab (1 for a sheet moving as one block, 0 without a common motion)
    const Vabs = Math.hypot(motion.V[0], motion.V[1]);
    let iLab = msdLab.findIndex(function (v) { return v > 0; }), vCell = null, psi = null;
    if (iLab >= 0) { const t1 = Slab.taus_s[iLab]; vCell = Math.sqrt(msdLab[iLab]) / t1; psi = Math.min(1, Vabs * t1 / Math.sqrt(msdLab[iLab])); }
    // slope of the displacement over the last decade of delays, and its last value
    const ok = msd.map(function (v, i) { return v > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    let slope = null, last = null, lastT = null;
    if (ok.length >= 3) {
      const iEnd = ok[ok.length - 1], tEnd = Scm.taus_s[iEnd], sel = ok.filter(function (i) { return Scm.taus_s[i] >= tEnd / 10; });
      if (sel.length >= 3) { let sx = 0, sy = 0, sxx = 0, sxy = 0; sel.forEach(function (i) { const x = Math.log(Scm.taus_s[i]), y = Math.log(msd[i]); sx += x; sy += y; sxx += x * x; sxy += x * y; }); const m = sel.length; slope = (m * sxy - sx * sy) / (m * sxx - sx * sx); }
      last = msd[iEnd]; lastT = Scm.taus_s[iEnd];
    }
    const cell2 = opts.cell_area_um2 || 225;
    // reachable: f has fallen below 0.1 at the lowest q of the band before the movie ends: displacement beyond the band
    const beyond = ok.length && ok[ok.length - 1] < Scm.taus_s.length - 1;
    // too small to measure at all (every f above 0.95): far below a cell
    const tiny = !ok.length, minMsd = -4 * Math.log(0.95) / Math.pow(Slab.q_per_um[bHi], 2);
    const solid = tiny || (last !== null && !beyond && last < 0.1 * cell2);
    const flock = psi !== null && psi > 0.5 && Vabs > 3 * motion.V_err;
    yield { stage: "Following the sheet", frac: 1 };
    return {
      n: movie.n, T: movie.T, L_um: movie.L_um, lags: Slab.lags, taus_s: Slab.taus_s, d2d: (useCM ? Scm : Slab).d2d, d2d_lab: Slab.d2d, binOf: Slab.binOf, nb: nb, q_per_um: Slab.q_per_um,
      A: A, B: Array.from({ length: nb + 1 }, function () { return B; }), B_camera: B, rows: rows, bins: rows.filter(function (r) { return r.used; }).map(function (r) { return r.b; }),
      band: { q_lo: Slab.q_per_um[bLo], q_hi: Slab.q_per_um[bHi], q_peak: Slab.q_per_um[bPeak] },
      msd: msd, msd_lab: msdLab, msd_min_um2: minMsd, msd_tiny: tiny, msd_slope: slope, msd_last_um2: last, msd_last_h: lastT, msd_beyond: beyond,
      V_um_h: motion.V, V_err_um_h: motion.V_err, R_um: motion.R, v_cell_um_h: vCell, psi: psi,
      state: flock ? (solid ? "flocking solid" : "flocking liquid") : (solid ? "jammed" : "fluid"), comoving: useCM,
      window: { q_lo_per_um: Slab.q_per_um[2], q_hi_per_um: Slab.q_per_um[nb], q_opt_per_um: movie.q_opt_per_um, q_min_used: Slab.q_per_um[bLo], q_max_used: Slab.q_per_um[bHi] }
    };
  }
  const api = { analyse: analyse, sheetMotion: sheetMotion };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TISSUE_ENGINE = api;
})(this);
