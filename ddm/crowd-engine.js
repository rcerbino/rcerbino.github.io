/* DDM of particles that push each other (concentrated suspensions): structure and collective diffusion.
 *
 * For N identical particles, all dyed, the amplitude of the structure function is A(q) = N <|K(q, z)|^2> S(q): the image of
 * one particle times the structure factor, which says how the particles arrange themselves. Dividing by the amplitude per
 * particle of a dilute sample of the same particles, filmed the same way (a second, short movie: the reference), gives
 * S(q) (as in confocal DDM, Lu et al., Phys. Rev. Lett. 108, 218103, 2012). With only a share x of the particles dyed,
 * the same ratio is 1 + x (S(q) - 1).
 * The patterns then fade as the collective intermediate scattering function, at short times at the rate
 *   Gamma(q) = D0 q^2 H(q) / S(q)        (H, the hydrodynamic function: 1 without hydrodynamic interactions)
 * so patterns at the peak of S(q), the typical distance between neighbours, fade most slowly (de Gennes narrowing), and
 * the widest patterns faster than in a dilute sample, by 1 / S(0). With few particles dyed, the patterns follow single
 * particles instead (self diffusion).
 *
 * Steps: structure function as on the other pages; A = 2 <|F|^2> - B with B from the camera; S(q) from the reference;
 * at each q, f = 1 - (d - B) / A, its short-time rate from a straight line through ln f over the first delays (down to
 * f = 0.6, at least three), and D(q) = Gamma / q^2; uncertainties from a jackknife over ten parts of the movie.
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  const K = 10;
  function need(c, m) { if (!c) throw new Error("Crowded particles: " + m); }

  /* Percus-Yevick structure factor of hard spheres (Wertheim, Thiele), x = q sigma, eta the volume fraction */
  function percusYevick(eta, x) {
    const a = Math.pow(1 + 2 * eta, 2) / Math.pow(1 - eta, 4), b = -6 * eta * Math.pow(1 + eta / 2, 2) / Math.pow(1 - eta, 4), g = eta * a / 2;
    if (x < 1e-2) return Math.pow(1 - eta, 4) / Math.pow(1 + 2 * eta, 2);
    const s = Math.sin(x), c = Math.cos(x);
    const rc = -24 * eta / Math.pow(x, 6) * (a * x * x * x * (s - x * c) + b * x * x * (2 * x * s - (x * x - 2) * c - 2) + g * ((4 * x * x * x - 24 * x) * s - (x * x * x * x - 12 * x * x + 24) * c + 24));
    return 1 / (1 - rc);
  }

  /* the reference movie (dilute, same optics): the amplitude per particle A_ref(q) / N_ref and the short-time rate of each q
     bin for particles that do not interact. The rate holds D0 q^2 and what motion along the axis adds (particles leaving
     the layer in focus), so that the ratio of the rates removes the optics, as the ratio of the amplitudes does for S(q). */
  // windowing: each frame first loses its mean brightness, so that the uniform background does not leak into every q
  function demeaned(movie) {
    const P0 = movie.n * movie.n, fr = new Float32Array(movie.frames.length);
    for (let t = 0; t < movie.T; t++) { const o = t * P0; let m = 0; for (let p = 0; p < P0; p++) m += movie.frames[o + p]; m /= P0; for (let p = 0; p < P0; p++) fr[o + p] = movie.frames[o + p] - m; }
    return Object.assign({}, movie, { frames: fr, fft: null });
  }
  // a camera filled to its full well records nothing more: stop with a plain message
  function checkSaturation(movie) {
    const fw = movie.info && movie.info.full_well_e; if (!(fw < Infinity)) return;
    let n = 0; const fr = movie.frames, m = Math.min(fr.length, movie.n * movie.n * 8);
    for (let i = 0; i < m; i++) if (fr[i] >= fw * 0.999) n++;
    need(n <= 0.01 * m, "the camera is saturated (" + Math.round(100 * n / m) + " % of the pixels at the full well): turn the lamp power down");
  }
  function* referenceAmplitude(ref, opts) {
    opts = opts || {};
    const S = yield* DDM.structure(opts.windowing ? demeaned(ref) : ref, { blocks: 2, windowing: !!opts.windowing });
    const B = DDM.detectorNoiseB(ref, S.window), n = ref.info.n_particles, nb = S.nb, L = S.L;
    const out = new Float64Array(nb + 1).fill(NaN), rate = new Float64Array(nb + 1).fill(NaN);
    for (let b = 1; b <= nb; b++) {
      if (!(S.nmodes[b] > 0)) continue;
      const Bb = B !== null ? B : S.B_est[b], A = 2 * S.powq[b] - Bb; out[b] = A / n;
      if (!(A > Bb)) continue;
      const f = new Float64Array(L), sf = new Float64Array(L).fill(0.02);
      for (let li = 0; li < L; li++) f[li] = 1 - (S.dq[li][b] - Bb) / A;
      const r = shortRate(S.taus_s, f, sf, true); if (r && r.rate > 0) rate[b] = r.rate;
    }
    // both change smoothly with q (they come from the optics and from D0 q^2): smoothed over neighbouring q, a local
    // quadratic through the logarithm over seven bins (each bin alone holds few independent looks at the particles)
    return { perParticle: Array.from(smoothLn(out, 3)), rate: Array.from(smoothLn(rate, 3)), raw: { perParticle: Array.from(out), rate: Array.from(rate) }, n: n };
  }

  function smoothLn(y, h) {
    const n = y.length, out = new Float64Array(n).fill(NaN);
    for (let b = 0; b < n; b++) {
      if (!(y[b] > 0)) continue;
      let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, Y0 = 0, Y1 = 0, Y2 = 0;
      for (let k = Math.max(0, b - h); k <= Math.min(n - 1, b + h); k++) { if (!(y[k] > 0)) continue; const x = k - b, v = Math.log(y[k]); S0++; S1 += x; S2 += x * x; S3 += x * x * x; S4 += x * x * x * x; Y0 += v; Y1 += x * v; Y2 += x * x * v; }
      if (S0 < 4) { out[b] = y[b]; continue; }
      // value at x = 0 of the least-squares parabola (Cramer's rule on the normal equations)
      const det = S0 * (S2 * S4 - S3 * S3) - S1 * (S1 * S4 - S3 * S2) + S2 * (S1 * S3 - S2 * S2);
      const a0 = (Y0 * (S2 * S4 - S3 * S3) - S1 * (Y1 * S4 - S3 * Y2) + S2 * (Y1 * S3 - S2 * Y2)) / det;
      out[b] = Math.abs(det) > 1e-12 ? Math.exp(a0) : y[b];
    }
    return out;
  }

  // straight line through ln f against t, weighted by (f / sf)^2: the rate -slope, from the first delays down to f = 0.6;
  // with free = false the line is forced through ln f = 0 at zero delay
  function shortRate(t, f, sf, free) {
    const xs = [], ys = [], ws = [];
    for (let i = 0; i < t.length; i++) {
      if (!(f[i] > 0)) break;
      if (f[i] < 0.6 && xs.length >= 3) break;
      if (f[i] < 0.3) break;
      xs.push(t[i]); ys.push(Math.log(f[i])); ws.push(Math.pow(f[i] / Math.max(sf[i], 1e-4), 2));
    }
    if (xs.length < 3) return null;
    if (free === false) {
      let Sxx = 0, Sxy = 0; for (let i = 0; i < xs.length; i++) { Sxx += ws[i] * xs[i] * xs[i]; Sxy += ws[i] * xs[i] * ys[i]; }
      return Sxx > 0 ? { rate: -Sxy / Sxx, n: xs.length, err: Math.sqrt(1 / Sxx) } : null;
    }
    // the line need not go through ln f = 0: a fast part below the first delay, or an error in A, shifts it
    let S0 = 0, S1 = 0, S2 = 0, Y0 = 0, Y1 = 0;
    for (let i = 0; i < xs.length; i++) { S0 += ws[i]; S1 += ws[i] * xs[i]; S2 += ws[i] * xs[i] * xs[i]; Y0 += ws[i] * ys[i]; Y1 += ws[i] * xs[i] * ys[i]; }
    const det = S0 * S2 - S1 * S1; if (!(det > 0)) return null;
    const slope = (S0 * Y1 - S1 * Y0) / det;
    return { rate: -slope, n: xs.length, err: Math.sqrt(S0 / det) };
  }

  function* analyse(movie, opts) {
    opts = opts || {};
    need(opts.reference && opts.reference.perParticle, "the reference amplitude is missing");
    const nLab = opts.n_labelled; need(nLab > 0, "no dyed particle");
    // the published method: B at each q from the first delays, the line through f = 1
    const pub = !!opts.published_only, free = pub ? false : opts.offset !== false, useRef = !pub && opts.ref_rate !== false && !!opts.reference.rate;
    const smooth = !pub && opts.ref_smooth !== false, R = smooth || !opts.reference.raw ? opts.reference : opts.reference.raw;
    const D0 = opts.D0_um2_s;
    checkSaturation(movie);
    need(!(opts.q_min_per_um > 0 && opts.q_max_per_um > 0 && opts.q_min_per_um >= opts.q_max_per_um), "the lowest q of the fit range is above the highest");
    const S = yield* DDM.structure(opts.windowing ? demeaned(movie) : movie, Object.assign({}, opts, { blocks: K }));
    const nb = S.nb, L = S.L, taus = S.taus_s, qv = S.q_per_um;
    const jack = []; for (let j = 0; j < S.blocks; j++) jack.push(S.jackDq(j));
    const camB = pub || opts.noise === "fit" ? null : DDM.detectorNoiseB(movie, S.window);
    const A = new Float64Array(nb + 1).fill(NaN), B = new Float64Array(nb + 1).fill(NaN);
    for (let b = 1; b <= nb; b++) { if (!(S.nmodes[b] > 0)) continue; B[b] = camB !== null ? camB : S.B_est[b]; A[b] = 2 * S.powq[b] - B[b]; }
    const ref = R.perParticle;
    const qmin = Math.max(2 * S.q_lo_per_um, opts.q_min_per_um || 0), qmax = Math.min(S.q_hi_per_um, opts.q_max_per_um || Infinity);
    // q where both this movie and the reference carry signal well above the camera noise (both amplitudes above B)
    const bins = []; for (let b = 1; b <= nb; b++) if (S.nmodes[b] > 0 && qv[b] >= qmin && qv[b] <= qmax && A[b] > B[b] && ref[b] * nLab > B[b]) bins.push(b);
    need(bins.length >= 4, "too few wave vectors in the measurable range");
    yield { stage: "Structure and rates", frac: 0.5 };
    // the amplitude of each q from parts of the movie, for the uncertainty of S(q): the mean power of each part
    const rows = bins.map(function (b) {
      const Sq = (A[b] / nLab) / ref[b];
      const f = new Float64Array(L), sf = new Float64Array(L);
      for (let li = 0; li < L; li++) {
        f[li] = 1 - (S.dq[li][b] - B[b]) / A[b];
        let m = 0; for (let j = 0; j < jack.length; j++) m += jack[j][li][b]; m /= jack.length;
        let v = 0; for (let j = 0; j < jack.length; j++) v += (jack[j][li][b] - m) * (jack[j][li][b] - m);
        sf[li] = Math.sqrt(v * (jack.length - 1) / jack.length) / A[b];
      }
      const r = shortRate(taus, f, sf, free);
      // jackknife of the rate
      let rerr = null;
      if (r) {
        const reps = jack.map(function (dj) { const fj = new Float64Array(L); for (let li = 0; li < L; li++) fj[li] = 1 - (dj[li][b] - B[b]) / A[b]; const rj = shortRate(taus, fj, sf, free); return rj ? rj.rate : NaN; }).filter(isFinite);
        if (reps.length >= 3) { const m = reps.reduce(function (a, x) { return a + x; }, 0) / reps.length; rerr = Math.sqrt(reps.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) * (reps.length - 1) / reps.length); }
      }
      // D(q) = Gamma / q^2, or D0 Gamma / Gamma_ref (the reference rate at the same q, from particles that do not interact)
      const q = qv[b], rr = R.rate ? R.rate[b] : NaN, per = useRef ? (rr > 0 ? D0 / rr : null) : 1 / (q * q);
      // a pattern that the movie renews only once or twice has an uncertain amplitude (few independent looks at it)
      let fl = Infinity; for (let li = Math.floor(0.8 * L); li < L; li++) fl = Math.min(fl, f[li]);
      return { b: b, q_per_um: q, S: Sq, renewed: fl < 0.2, f: Array.from(f), f_err: Array.from(sf), rate_hz: r ? r.rate : null, rate_err_hz: rerr, n_pts: r ? r.n : 0, rate_ref_hz: rr > 0 ? rr : null,
        D_um2_s: r && per ? r.rate * per : null, D_err_um2_s: r && rerr && per ? rerr * per : null };
    });
    // the uncertainty of S(q): the scatter of neighbouring q about a smooth curve is the honest one (each q holds few
    // independent looks at the arrangement); here the local scatter over five neighbours
    rows.forEach(function (r, k) {
      const nb5 = rows.slice(Math.max(0, k - 2), Math.min(rows.length, k + 3)).map(function (x) { return x.S; });
      const m = nb5.reduce(function (a, x) { return a + x; }, 0) / nb5.length;
      r.S_err = nb5.length > 2 ? Math.sqrt(nb5.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / (nb5.length - 1)) : null;
    });
    // the peak of S(q) (largest S among the q used, refined by a parabola through it and its neighbours)
    let kp = -1;
    for (let k = 2; k < rows.length - 1; k++) { const r = rows[k]; if (r.S >= rows[k - 1].S && r.S >= rows[k + 1].S && r.S - 1 > 2 * (r.S_err || 0) && (kp < 0 || r.S > rows[kp].S)) kp = k; }
    if (kp < 0) { kp = 0; rows.forEach(function (r, k) { if (r.S > rows[kp].S) kp = k; }); }
    let qPeak = rows[kp].q_per_um, SPeak = rows[kp].S;
    if (kp > 0 && kp < rows.length - 1) {
      const y0 = rows[kp - 1].S, y1 = rows[kp].S, y2 = rows[kp + 1].S, den = y0 - 2 * y1 + y2;
      if (den < 0) { const d = 0.5 * (y0 - y2) / den, dq = rows[kp + 1].q_per_um - rows[kp].q_per_um; qPeak += d * dq; SPeak = y1 - 0.25 * (y0 - y2) * d; }
    }
    // D at the peak and at the widest patterns, against D0 (smoothed over three q)
    const dAt = function (k) { const v = rows.slice(Math.max(0, k - 1), Math.min(rows.length, k + 2)).map(function (r) { return r.D_um2_s; }).filter(function (x) { return x > 0; }); return v.length ? v.reduce(function (a, x) { return a + x; }, 0) / v.length : null; };
    // the widest patterns that the movie renews well (the first three)
    let k0 = 0; while (k0 < rows.length - 3 && !rows[k0].renewed) k0++;
    const lowRenewed = rows[k0].renewed; if (!lowRenewed) k0 = 0;     // none renewed: the widest patterns all the same, flagged
    const low = rows.slice(k0, k0 + 3), S0 = low.reduce(function (a, r) { return a + r.S; }, 0) / low.length;
    yield { stage: "Structure and rates", frac: 1 };
    return {
      n: S.n, lags: S.lags, taus_s: taus, pairs: S.pairs, q_per_um: Array.from(qv), d2d: S.d2d, binOf: S.binOf, times_s: S.times_s,
      A: Array.from(A), B: Array.from(B), B_camera: camB, offset: free, ref_rate: useRef, ref_smooth: smooth, bins: bins, rows: rows, D0_um2_s: D0, n_labelled: nLab, n_reference: opts.reference.n,
      peak: { q_per_um: qPeak, S: SPeak, k: kp, D_um2_s: dAt(kp) }, S_low: S0, D_low_um2_s: dAt(k0 + 1), k_low: k0 + 1, low_renewed: lowRenewed,
      window: { q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um, q_opt_per_um: S.q_opt_per_um, q_min_used: qv[bins[0]], q_max_used: qv[bins[bins.length - 1]] }
    };
  }

  /* the reference movie: the same particles, optics and frame rate, dilute (4 %), without interactions, log-spaced frames
     stretched so that the first delays give the short-time rates while the movie lasts long enough for the particles to
     wander through the whole depth of the chamber twice (otherwise the number near the focus, which sets the amplitude,
     depends on where they happened to start) and to renew even the widest patterns many times */
  function referenceConfig(cfg, tauB_s) {
    const c = JSON.parse(JSON.stringify(cfg));
    delete c.interact; c.volume_fraction = 0.04; c.seed = (cfg.seed || 1) + 7;
    const D0 = cfg.diameter_um * cfg.diameter_um / tauB_s, span = Math.max(10 * tauB_s, 2 * cfg.cell_um * cfg.cell_um / D0);
    const T = c.n_frames, dt = 1 / c.frame_rate_hz, need = span / (T * dt);
    const k0 = c.log_timing ? c.log_timing.factor : 1;
    if (need > k0) c.log_timing = { factor: Math.min(1000, Math.max(2, need)) };
    return c;
  }
  /* what the result table shows of a run of the published method */
  function publishedSummary(r) {
    const hp = r.peak.S > 1.15 && r.peak.S - r.S_low > 0.25 && r.peak.k > 0 && r.peak.k < r.rows.length - 1;
    return { has_peak: hp, peak_q_per_um: r.peak.q_per_um, peak_S: r.peak.S, peak_D_um2_s: r.peak.D_um2_s, S_low: r.S_low, D_low_um2_s: r.D_low_um2_s };
  }

  const api = { analyse: analyse, referenceAmplitude: referenceAmplitude, referenceConfig: referenceConfig, publishedSummary: publishedSummary, percusYevick: percusYevick, _test: { shortRate: shortRate } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CROWD = api;
})(typeof self !== "undefined" ? self : this);
