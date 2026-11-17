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

  /* Hydrodynamic interactions, from theory: the hydrodynamic function H(q) of hard spheres in the delta-gamma scheme of
   * Beenakker and Mazur (Physica A 126, 349, 1984), as written by Genz and Klein (Physica A 171, 26, 1991):
   *   H(q) = Ds/D0 + (3/2 pi) int d(ak) [sin(ak)/(ak)]^2 / [1 + phi S_g(ak)] int_-1^1 dx (1 - x^2) [S(|q - k|) - 1],
   *   Ds/D0 = (2/pi) int dy [sin(y)/y]^2 / [1 + phi S_g(y)],
   * a the radius, S(q) from Percus-Yevick, S_g with the renormalised coefficients gamma0 of Beenakker and Mazur's
   * table 1 (fitted with a fourth-order polynomial in phi). Returns tables against q sigma. */
  const GAMMA0 = [[0, 0, 0, 0, 0], [0.05, 0.0553, 0.0542, 0.0533, 0.0525], [0.10, 0.1228, 0.1177, 0.1135, 0.1104], [0.15, 0.2048, 0.1918, 0.1813, 0.1738],
    [0.20, 0.3038, 0.2777, 0.2574, 0.2432], [0.25, 0.4224, 0.3766, 0.3423, 0.3186], [0.30, 0.5627, 0.4895, 0.4364, 0.4005], [0.35, 0.7267, 0.6172, 0.5402, 0.4888],
    [0.40, 0.9157, 0.7601, 0.6538, 0.5839], [0.45, 1.1310, 0.9183, 0.7776, 0.6856]];
  function gamma0(phi, c) {
    // phi gamma0 at the table points, linear interpolation (the table is smooth), divided by phi
    let k = 1; while (k < GAMMA0.length - 1 && GAMMA0[k][0] < phi) k++;
    const a = GAMMA0[k - 1], b = GAMMA0[k], w = (phi - a[0]) / (b[0] - a[0]), v = a[c] + w * (b[c] - a[c]);
    return phi > 0 ? v / phi : 1;
  }
  let SI_TAB = null; const SI_DX = 0.005;
  function sineIntegral(x) {
    if (!SI_TAB) { const n = Math.ceil(400 / SI_DX) + 2; SI_TAB = new Float64Array(n); let acc = 0; const f = function (t) { return t === 0 ? 1 : Math.sin(t) / t; };
      for (let i = 1; i < n; i++) { const t0 = (i - 1) * SI_DX, t1 = i * SI_DX; acc += SI_DX / 6 * (f(t0) + 4 * f(0.5 * (t0 + t1)) + f(t1)); SI_TAB[i] = acc; } }
    if (x >= (SI_TAB.length - 2) * SI_DX) return Math.PI / 2 - Math.cos(x) / x;
    const t = x / SI_DX, i = Math.floor(t); return SI_TAB[i] + (t - i) * (SI_TAB[i + 1] - SI_TAB[i]);
  }
  // spherical Bessel j_n(x), n = 1..4 (series near 0, upward recurrence beyond)
  function sphJ(n, x) {
    if (x < 1.5) { let df = 1; for (let k = 1; k <= 2 * n + 1; k += 2) df *= k; const x2 = x * x; return Math.pow(x, n) / df * (1 - x2 / (2 * (2 * n + 3)) + x2 * x2 / (8 * (2 * n + 3) * (2 * n + 5)) - x2 * x2 * x2 / (48 * (2 * n + 3) * (2 * n + 5) * (2 * n + 7))); }
    let j0 = Math.sin(x) / x, j1 = Math.sin(x) / (x * x) - Math.cos(x) / x;
    for (let k = 1; k < n; k++) { const j2 = (2 * k + 1) / x * j1 - j0; j0 = j1; j1 = j2; }
    return j1;
  }
  function Sgamma(x, mm1) {
    if (x < 1e-4) x = 1e-4;
    const x2 = 2 * x, x3 = x * x * x, x4 = x3 * x, sx = Math.sin(x), cx = Math.cos(x);
    let C = 4.5 * (sineIntegral(x2) / x + 0.5 * Math.cos(x2) / (x * x) + 0.25 * Math.sin(x2) / x3 - sx * sx / x4 - 4 / (x3 * x3) * Math.pow(sx - x * cx, 2));
    if (x < 0.05) C = 2.5;
    // J_{n+1/2}(x)^2 = (2x / pi) j_n(x)^2
    const J2 = function (n) { const j = sphJ(n, x); return 2 * x / Math.PI * j * j; };
    return C + 2.25 * Math.PI * (5 * mm1[0] / x3 * J2(1) + 25 * mm1[1] / x3 * J2(2) + 49 * mm1[2] / x3 * J2(3) + 81 * mm1[3] / x3 * J2(4));
  }
  const HYDRO_CACHE = {};
  function hydroTheory(phi) {
    const key = phi.toFixed(4); if (HYDRO_CACHE[key]) return HYDRO_CACHE[key];
    need(phi > 0 && phi <= 0.45, "hydrodynamic theory needs a volume fraction between 0 and 0.45");
    const mm1 = [1, 2, 3, 4].map(function (c) { return gamma0(phi, c) - 1; });
    // y = a k (a the radius); S on a fine table in q sigma = 2 y for |q - k|
    const dS = 0.01, nS = 40000, Stab = new Float64Array(nS);
    for (let i = 0; i < nS; i++) Stab[i] = percusYevick(phi, i * dS) - 1;
    const Sm1 = function (qs) { const t = qs / dS; if (t >= nS - 1) return 0; const i = Math.floor(t); return Stab[i] + (t - i) * (Stab[i + 1] - Stab[i]); };
    const dy = 0.04, yMax = 60 * Math.PI, ny = Math.ceil(yMax / dy);
    const wY = new Float64Array(ny + 1), yv = new Float64Array(ny + 1);
    let Ds = 0;
    for (let i = 0; i <= ny; i++) {
      const y = i * dy, sc = y === 0 ? 1 : Math.sin(y) / y, w = (i === 0 || i === ny ? 0.5 : 1) * dy * sc * sc / (1 + phi * Sgamma(y, mm1));
      yv[i] = y; wY[i] = w; Ds += w;
    }
    Ds = Ds * 2 / Math.PI + 2 / Math.PI / yMax * 0.5;   // tail of (sin y / y)^2: about 1 / (2 y)
    // Gauss-Legendre in x = cos(angle), 48 points
    const ng = 48, gx = [], gw = [];
    for (let i = 1; i <= ng; i++) { let z = Math.cos(Math.PI * (i - 0.25) / (ng + 0.5)), pp = 0; for (let it = 0; it < 50; it++) { let p1 = 1, p2 = 0; for (let j = 1; j <= ng; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; } pp = ng * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-14) break; } gx.push(z); gw.push(2 / ((1 - z * z) * pp * pp)); }
    const qs = [], Sq = [], Hq = [];
    for (let iqs = 1; iqs <= 400; iqs++) {
      const qsig = 0.1 * iqs;
      const qa = qsig / 2; let I = 0;
      for (let i = 1; i <= ny; i++) {
        const ya = yv[i]; let inner = 0;
        for (let g = 0; g < ng; g++) { const x = gx[g], d = Math.sqrt(Math.max(0, qa * qa + ya * ya - 2 * qa * ya * x)); inner += gw[g] * (1 - x * x) * Sm1(2 * d); }
        I += wY[i] * inner;
      }
      qs.push(qsig); Sq.push(Sm1(qsig) + 1); Hq.push(Ds + 1.5 / Math.PI * I);
    }
    const out = { q_sigma: qs, S: Sq, H: Hq, Ds_over_D0: Ds, phi: phi };
    HYDRO_CACHE[key] = out; return out;
  }

  /* the reference movie (dilute, same optics): the amplitude per particle A_ref(q) / N_ref and the short-time rate of each q
     bin for particles that do not interact. The rate holds D0 q^2 and what motion along the axis adds (particles leaving
     the layer in focus), so that the ratio of the rates removes the optics, as the ratio of the amplitudes does for S(q). */
  function* referenceAmplitude(ref) {
    const S = yield* DDM.structure(ref, { blocks: 2 });
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
    const S = yield* DDM.structure(movie, Object.assign({}, opts, { blocks: K }));
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
    let kp = 0; rows.forEach(function (r, k) { if (r.S > rows[kp].S) kp = k; });
    let qPeak = rows[kp].q_per_um, SPeak = rows[kp].S;
    if (kp > 0 && kp < rows.length - 1) {
      const y0 = rows[kp - 1].S, y1 = rows[kp].S, y2 = rows[kp + 1].S, den = y0 - 2 * y1 + y2;
      if (den < 0) { const d = 0.5 * (y0 - y2) / den, dq = rows[kp + 1].q_per_um - rows[kp].q_per_um; qPeak += d * dq; SPeak = y1 - 0.25 * (y0 - y2) * d; }
    }
    // D at the peak and at the widest patterns, against D0 (smoothed over three q)
    const dAt = function (k) { const v = rows.slice(Math.max(0, k - 1), Math.min(rows.length, k + 2)).map(function (r) { return r.D_um2_s; }).filter(function (x) { return x > 0; }); return v.length ? v.reduce(function (a, x) { return a + x; }, 0) / v.length : null; };
    // the widest patterns that the movie renews well (the first three)
    let k0 = 0; while (k0 < rows.length - 3 && !rows[k0].renewed) k0++;
    const low = rows.slice(k0, k0 + 3), S0 = low.reduce(function (a, r) { return a + r.S; }, 0) / low.length;
    yield { stage: "Structure and rates", frac: 1 };
    return {
      n: S.n, lags: S.lags, taus_s: taus, pairs: S.pairs, q_per_um: Array.from(qv), d2d: S.d2d, binOf: S.binOf, times_s: S.times_s,
      A: Array.from(A), B: Array.from(B), B_camera: camB, offset: free, ref_rate: useRef, ref_smooth: smooth, bins: bins, rows: rows, D0_um2_s: D0, n_labelled: nLab, n_reference: opts.reference.n,
      peak: { q_per_um: qPeak, S: SPeak, k: kp, D_um2_s: dAt(kp) }, S_low: S0, D_low_um2_s: dAt(k0 + 1), k_low: k0 + 1,
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
    if (need > k0) c.log_timing = { factor: Math.min(2000, Math.max(2, need)) };
    return c;
  }
  /* what the result table shows of a run of the published method */
  function publishedSummary(r) {
    const hp = r.peak.S > 1.15 && r.peak.S - r.S_low > 0.25 && r.peak.k > 0 && r.peak.k < r.rows.length - 1;
    return { has_peak: hp, peak_q_per_um: r.peak.q_per_um, peak_S: r.peak.S, peak_D_um2_s: r.peak.D_um2_s, S_low: r.S_low, D_low_um2_s: r.D_low_um2_s };
  }

  const api = { analyse: analyse, hydroTheory: hydroTheory, referenceAmplitude: referenceAmplitude, referenceConfig: referenceConfig, publishedSummary: publishedSummary, percusYevick: percusYevick, _test: { shortRate: shortRate, Sgamma: Sgamma, sineIntegral: sineIntegral, sphJ: sphJ } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CROWD = api;
})(typeof self !== "undefined" ? self : this);
