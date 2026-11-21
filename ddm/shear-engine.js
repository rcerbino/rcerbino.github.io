/* DDM of a sample under oscillatory shear: echo-DDM (Edera et al., Soft Matter 17, 8553, 2021).
 *
 * The sample is sheared back and forth with strain gamma0 sin(2 pi t / T0). Frames are taken m times per period. Two
 * frames a whole number of periods apart show the sample in the same macroscopic state: the affine part of the motion,
 * which the shear undoes every cycle, cancels, and only what the shear did not undo (rearrangements, diffusion) is left.
 *
 *   d(q, dt) = <|F(q, t + dt) - F(q, t)|^2>, averaged over every starting frame t (and so over every phase of the cycle),
 *   d(q, k T0) = A(q) [1 - f(q, k T0)] + B,   f = exp(-D q^2 k T0) for rearrangements that add up like diffusion.
 *
 * Steps:
 *   1. d(q, dt) at every delay up to three periods (to show the affine decorrelation and the echoes) and at whole numbers
 *      of periods up to half the movie (log-spaced), kept in 2D for the maps;
 *   2. averages over rings of q and over two sectors of +- 20 degrees: q along the flow (x) and along the vorticity (y);
 *      at the echoes, only pairs that start when the strain is zero (opts.phase "rest", the default; the camera starts at
 *      the rest position of the plate): a bead that has moved along the gradient between two echoes sits where the
 *      affine displacement is different, which adds gamma0^2 sin^2(phase) <dz^2> along the flow; at zero strain it adds
 *      nothing. opts.phase "all" or opts.published_only: every starting frame, as in the paper (all phases averaged);
 *   3. B from the camera (2 x (excess-noise factor x mean count + read noise^2)); opts.noise "fit" or opts.published_only:
 *      B from a quadratic through the first three echoes, extrapolated to zero delay, as in the paper;
 *      A = 2 <|F|^2> - B (the mean power of each mode, so that a sample that never rearranges keeps its whole amplitude);
 *   4. at each q and in each sector, f at the echoes, and its rate from a weighted line through the origin of -ln f
 *      against the delay, over the echoes while f > 0.15 (weights f^2, a constant error of f);
 *   5. D along the flow and along the vorticity from the mean of ln(Gamma / q^2) over the q used; uncertainty from a
 *      jackknife over eight parts of the movie (at least the scatter over q); when no pattern fades enough, the slowest D
 *      this movie could show.
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  function need(c, m) { if (!c) throw new Error("Shear analysis: " + m); }
  const SECTOR_DEG = 20;

  // camera noise per pixel: white, the same at every q
  function cameraB(movie) {
    const info = movie.info;
    if (!(info && typeof info.read_noise_e === "number" && movie.frames)) return null;
    const F = movie.frames, enf = info.excess_noise || 1, r2 = info.read_noise_e * info.read_noise_e;
    let s = 0; for (let k = 0; k < F.length; k++) s += F[k];
    return 2 * (enf * s / F.length + r2);
  }

  function* analyse(movie, opts) {
    opts = opts || {};
    const pub = opts.published_only === true;
    const allPhases = pub || opts.phase === "all";
    const noise = pub ? "fit" : (opts.noise || "camera");
    const m = opts.frames_per_period | 0; need(m >= 1 && m <= 64, "frames per period missing");
    const n = movie.n, T = movie.T, P = n * n, fft = movie.fft, dt = 1 / movie.frame_rate_hz, T0 = m * dt;
    const Kmax = Math.floor((T - 1) / (2 * m));
    need(Kmax >= 3, "the movie must last at least six periods");
    // delays: every frame up to three periods (fewer if the movie is short), then whole periods, log-spaced
    const lagSet = new Set();
    for (let k = 1; k <= Math.min(3 * m, Math.floor((T - 1) / 2)); k++) lagSet.add(k);
    const ks = [];
    for (let i = 0; i < 40; i++) { const k = Math.max(1, Math.round(Math.pow(Kmax, i / 39))); if (ks.indexOf(k) < 0) ks.push(k); }
    ks.forEach(function (k) { lagSet.add(k * m); });
    const lags = Array.from(lagSet).sort(function (a, b) { return a - b; });
    const taus_s = lags.map(function (l) { return l * dt; });
    const echoLi = ks.map(function (k) { return lags.indexOf(k * m); });
    const isEcho = new Set(ks.map(function (k) { return k * m; }));
    // frames at zero strain: the first frame and every half period after it (every period when m is odd)
    const restStep = m % 2 === 0 ? m / 2 : m, atRest = function (t) { return t % restStep === 0; };

    // Fourier pixels: ring bin, and sector (1: q along the flow, x; 2: along the vorticity, y; 0: neither)
    const nb = n / 2, binOf = new Int32Array(P).fill(-1), secOf = new Int8Array(P), nmodes = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)];
    const tanS = Math.tan(SECTOR_DEG * Math.PI / 180);
    for (let iy = 0; iy < n; iy++) {
      const ky = iy < n / 2 ? iy : iy - n;
      for (let ix = 0; ix < n; ix++) {
        const kx = ix < n / 2 ? ix : ix - n;
        if (kx === 0 || ky === 0) continue;                 // central cross: artefacts of the image edges
        const b = Math.round(Math.hypot(kx, ky)); if (b < 1 || b > nb) continue;
        const p = iy * n + ix; binOf[p] = b; nmodes[0][b]++;
        const s = Math.abs(ky) <= tanS * Math.abs(kx) ? 1 : Math.abs(kx) <= tanS * Math.abs(ky) ? 2 : 0;
        secOf[p] = s; if (s) nmodes[s][b]++;
      }
    }
    const q_per_um = new Float64Array(nb + 1); for (let b = 0; b <= nb; b++) q_per_um[b] = 2 * Math.PI * b / movie.L_um;

    // 1-2. structure function
    const d2d = [], dq = [[], [], []], dqR = [[], [], []];
    const ringAvg = function (acc, cnt) {
      const avg = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)];
      for (let p = 0; p < P; p++) { const b = binOf[p]; if (b > 0) { const v = acc[p] / cnt / P; avg[0][b] += v; if (secOf[p]) avg[secOf[p]][b] += v; } }
      for (let s = 0; s < 3; s++) for (let b = 1; b <= nb; b++) avg[s][b] = nmodes[s][b] > 0 ? avg[s][b] / nmodes[s][b] : NaN;
      return avg;
    };
    // at the echoes the pairs used are also summed in K blocks of the movie (by their first frame), for a jackknife
    const K = 8, blockOf = function (t) { return Math.min(K - 1, Math.floor(t * K / T)); }, jack = [];   // jack[echo index][k] = { avg, n }
    for (let li = 0; li < lags.length; li++) {
      const l = lags[li], acc = new Float64Array(P), np = T - l, echo = isEcho.has(l), accR = echo ? new Float64Array(P) : null;
      const accB = echo ? Array.from({ length: K }, function () { return new Float64Array(P); }) : null, nB = new Float64Array(K);
      let nR = 0;
      for (let t = 0; t < np; t++) {
        const o1 = 2 * P * t, o2 = 2 * P * (t + l), rest = echo && atRest(t), useB = echo && (allPhases || rest), ab = useB ? accB[blockOf(t)] : null;
        for (let p = 0; p < P; p++) { const dr = fft[o2 + 2 * p] - fft[o1 + 2 * p], di = fft[o2 + 2 * p + 1] - fft[o1 + 2 * p + 1], v = dr * dr + di * di; acc[p] += v; if (rest) accR[p] += v; if (ab) ab[p] += v; }
        if (rest) nR++;
        if (useB) nB[blockOf(t)]++;
      }
      const map = new Float32Array(P); for (let p = 0; p < P; p++) map[p] = acc[p] / np / P;
      const avg = ringAvg(acc, np), avgR = echo && nR > 0 ? ringAvg(accR, nR) : avg;
      for (let s = 0; s < 3; s++) { dq[s].push(avg[s]); dqR[s].push(avgR[s]); }
      if (echo) {
        // the structure function with block k left out
        const tot = allPhases ? acc : accR, ntot = allPhases ? np : nR, out = [];
        for (let k = 0; k < K; k++) { const a = new Float64Array(P); for (let p = 0; p < P; p++) a[p] = tot[p] - accB[k][p]; out.push(ntot - nB[k] > 0 ? ringAvg(a, ntot - nB[k]) : null); }
        jack.push({ lag: l, out: out });
      }
      d2d.push(map);
      yield { stage: "Comparing frames", frac: 0.85 * (li + 1) / lags.length };
    }
    // mean power of each mode (ring and sectors), over all frames and over the frames at zero strain only: these are the
    // frames the echoes compare, and the exposure blurs them most (the shear is fastest at zero strain), so their
    // amplitude is a little lower
    const pow = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)], powR = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)];
    let nRest = 0;
    for (let t = 0; t < T; t++) {
      const o = 2 * P * t, rest = atRest(t); if (rest) nRest++;
      for (let p = 0; p < P; p++) { const b = binOf[p]; if (b <= 0) continue; const v = fft[o + 2 * p] * fft[o + 2 * p] + fft[o + 2 * p + 1] * fft[o + 2 * p + 1]; pow[0][b] += v; if (secOf[p]) pow[secOf[p]][b] += v; if (rest) { powR[0][b] += v; if (secOf[p]) powR[secOf[p]][b] += v; } }
    }
    for (let s = 0; s < 3; s++) for (let b = 1; b <= nb; b++) { pow[s][b] = nmodes[s][b] > 0 ? pow[s][b] / (T * P * nmodes[s][b]) : NaN; powR[s][b] = nmodes[s][b] > 0 ? powR[s][b] / (nRest * P * nmodes[s][b]) : NaN; }
    yield { stage: "Fitting the echoes", frac: 0.9 };

    // 3. noise and amplitude
    const Bcam = cameraB(movie);
    const Bq = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)], Aq = [new Float64Array(nb + 1), new Float64Array(nb + 1), new Float64Array(nb + 1)];
    for (let s = 0; s < 3; s++) for (let b = 1; b <= nb; b++) {
      let B = Bcam;
      if (noise === "fit" || B === null) {
        // quadratic through the first three echoes, at zero delay
        const y = [0, 1, 2].map(function (i) { return dq[s][echoLi[i]][b]; }), x = [0, 1, 2].map(function (i) { return ks[i]; });
        const l0 = function (z) { return (z - x[1]) * (z - x[2]) / ((x[0] - x[1]) * (x[0] - x[2])); }, l1 = function (z) { return (z - x[0]) * (z - x[2]) / ((x[1] - x[0]) * (x[1] - x[2])); }, l2 = function (z) { return (z - x[0]) * (z - x[1]) / ((x[2] - x[0]) * (x[2] - x[1])); };
        B = Math.max(0, Math.min(y[0], y[0] * l0(0) + y[1] * l1(0) + y[2] * l2(0)));
      }
      Bq[s][b] = B; Aq[s][b] = 2 * (allPhases || opts.amp_frames === "all" ? pow : powR)[s][b] - B;   // amp_frames "all": A from every frame (a check used by the tests only)
    }

    // 4. rates at the echoes
    const qlo = opts.q_min_per_um > 0 ? opts.q_min_per_um : 0, qhi = opts.q_max_per_um > 0 ? opts.q_max_per_um : Infinity;
    const qNyq = q_per_um[nb], qOpt = movie.q_signal_max_per_um || movie.q_opt_per_um || qNyq, tEnd = ks[ks.length - 1] * T0;
    const rows = [];
    for (let b = 2; b <= nb; b++) {
      const q = q_per_um[b], row = { b: b, q_per_um: q, A: Aq[0][b], B: Bq[0][b], sec: [] };
      for (let s = 1; s <= 2; s++) {
        const DQ = allPhases ? dq : dqR, A = Aq[s][b], B = Bq[s][b], f = echoLi.map(function (li) { return 1 - (DQ[s][li][b] - B) / A; });
        const e = { A: A, B: B, f: f, gamma_hz: null, D_um2_s: null, used: false, reason: null };
        if (!(nmodes[s][b] >= 4)) e.reason = "too few modes in this sector";
        else if (q < qlo || q > qhi) e.reason = "outside the chosen q range";
        else if (q > Math.min(qNyq, 1.05 * qOpt)) e.reason = "finer than the objective resolves";
        else if (!(A > B)) e.reason = "signal below the camera noise";
        else {
          let sw = 0, swt = 0, np = 0, fl = 1;
          for (let i = 0; i < ks.length; i++) { const fi = f[i]; if (!(fi > 0.15)) break; const t = ks[i] * T0, w = fi * fi; sw += w * t * -Math.log(Math.min(1, fi)); swt += w * t * t; np++; fl = fi; }
          if (np < 3) e.reason = f[0] < 0.15 ? "faded within one period" : "too few echoes before it faded";
          else if (fl > 0.9) e.reason = "hardly fades within the movie";
          else { e.gamma_hz = Math.max(0, sw / swt); e.D_um2_s = e.gamma_hz / (q * q); e.used = e.gamma_hz > 0; if (!e.used) e.reason = "no fading"; }
        }
        row.sec.push(e);
      }
      rows.push(row);
    }
    // 5. D in each sector, and the slowest D the movie shows when none fades enough
    const qUse = rows.filter(function (r) { return r.q_per_um >= qlo && r.q_per_um <= Math.min(qhi, qNyq, 1.05 * qOpt) && r.A > r.B; });
    const qTop = qUse.length ? qUse[qUse.length - 1].q_per_um : qNyq;
    const Dmin = -Math.log(0.9) / (qTop * qTop * tEnd);
    const Dmax = -Math.log(0.15) / (Math.pow(qUse.length ? qUse[0].q_per_um : q_per_um[2], 2) * 3 * T0);
    const sector = function (s) {
      const u = rows.map(function (r) { return { q: r.q_per_um, e: r.sec[s] }; }).filter(function (x) { return x.e.used; });
      if (u.length < 2) {
        const anyFast = rows.some(function (r) { return r.sec[s].reason === "faded within one period"; });
        return { D_um2_s: null, n_used: u.length, bound: anyFast && !rows.some(function (r) { return r.sec[s].reason === "hardly fades within the movie"; }) ? { above: Dmax } : { below: Dmin } };
      }
      const l = u.map(function (x) { return Math.log(x.e.D_um2_s); }), mean = l.reduce(function (a, v) { return a + v; }, 0) / l.length;
      const sd = Math.sqrt(l.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / (l.length - 1));
      return { D_um2_s: Math.exp(mean), rel_err: sd / Math.sqrt(l.length), n_used: u.length, q_min_used: u[0].q, q_max_used: u[u.length - 1].q };
    };
    const flow = sector(0), vort = sector(1);
    // jackknife: the same q, rates refitted with one block of the movie left out at a time
    const rateOf = function (f) { let sw = 0, swt = 0; for (let i = 0; i < ks.length; i++) { const fi = f[i]; if (!(fi > 0.15)) break; const t = ks[i] * T0, w = fi * fi; sw += w * t * -Math.log(Math.min(1, fi)); swt += w * t * t; } return swt > 0 ? sw / swt : NaN; };
    [flow, vort].forEach(function (res, s) {
      if (!(res.D_um2_s > 0)) return;
      const u = rows.filter(function (r) { return r.sec[s].used; }), lnk = [];
      for (let k = 0; k < K; k++) {
        let sum = 0, n = 0;
        u.forEach(function (r) {
          const e = r.sec[s], f = ks.map(function (kk, i) { const j = jack[ks.indexOf(kk)].out[k]; return j ? 1 - (j[s + 1][r.b] - e.B) / e.A : NaN; });
          const g = rateOf(f); if (g > 0) { sum += Math.log(g / (r.q_per_um * r.q_per_um)); n++; }
        });
        if (n > 0) lnk.push(sum / n);
      }
      if (lnk.length >= 3) { const m = lnk.reduce(function (a, v) { return a + v; }, 0) / lnk.length; const v = (lnk.length - 1) / lnk.length * lnk.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0); res.rel_err_q = res.rel_err; res.rel_err = Math.max(res.rel_err, Math.sqrt(v)); res.jackknife_blocks = lnk.length; }
    });
    const used = rows.filter(function (r) { return r.sec[0].used || r.sec[1].used; });
    yield { stage: "Fitting the echoes", frac: 1 };
    return {
      n: n, T: T, L_um: movie.L_um, frames_per_period: m, period_s: T0, lags: lags, taus_s: taus_s, echo_k: ks, echo_li: echoLi, nb: nb, binOf: binOf, secOf: secOf,
      q_per_um: q_per_um, d2d: d2d, dq: dq, A: Aq[0], B: Bq[0], A_sec: [Aq[1], Aq[2]], B_sec: [Bq[1], Bq[2]], B_camera: Bcam, noise: noise === "fit" || Bcam === null ? "fit" : "camera",
      rows: rows, flow: flow, vort: vort, D_limit: { below: Dmin, above: Dmax },
      bins: used.map(function (r) { return r.b; }),
      window: { q_lo_per_um: q_per_um[2], q_hi_per_um: Math.min(qNyq, qOpt), q_opt_per_um: qOpt, q_min_used: used.length ? used[0].q_per_um : null, q_max_used: used.length ? used[used.length - 1].q_per_um : null },
      phase: allPhases ? "all" : "rest", rest_every_frames: restStep, published_only: pub
    };
  }
  const api = { analyse: analyse, SECTOR_DEG: SECTOR_DEG };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SHEAR_ENGINE = api;
})(this);
