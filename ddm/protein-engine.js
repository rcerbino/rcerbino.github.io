/*
 * DDM of proteins: the collective diffusion coefficient and the amplitude of the patterns from one movie, and, from a
 * series of concentrations, the second virial coefficient and the diffusion interaction parameter.
 *
 * One movie. d(q, dt) = A(q) g(q, dt) + B, with B the camera noise (known from the mean count and the read noise) and
 *   g(q, dt) = sum_n w_n(q) [ S(x_n) - K(x_n) exp(-gamma_n dt) ],  gamma_n = D (q^2 + k_n^2),  x_n = gamma_n T_e
 * The sum is over the cosine modes of the density between the walls of the cell (k_n = n pi / Lz), weighted by how much
 * each shows in the image of a protein at this q (w_n from the optical kernel, as in the simulation): proteins moving
 * up and down change the image too (depth of field). S(x) = 2 (x - 1 + e^-x) / x^2 and K(x) = 2 (cosh x - 1) / x^2
 * account for the exposure, during which the pattern keeps changing. At each q, D and A are fitted (A by linear least
 * squares at each D, D by a search on a logarithmic grid refined by golden sections), with uncertainties from a
 * jackknife over five parts of the movie. The published method alone: one exponential, g = 1 - exp(-D q^2 dt).
 *
 * A series. To first order in the concentration c (g/mL):  D_c = D0 (1 + k_D c)  and  c / A = (c / A)_0 (1 + 2 A2 M c),
 * since the amplitude per protein follows the structure factor S(0) = 1 / (1 + 2 A2 M c). Weighted straight lines give
 * D0, k_D and A2; the optics cancel in the ratio of amplitudes because every movie is filmed the same way.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./ddm-engine.js"));
  else root.PROTEIN_ENGINE = factory(root.DDM);
})(typeof self !== "undefined" ? self : this, function (DDM) {
  "use strict";
  function need(c, msg) { if (!c) throw new Error("Protein analysis: " + msg); }
  const KB = 1.380649e-23;

  // exposure factors, stable at small and large x
  function Sx(x) { return x < 1e-4 ? 1 - x / 3 : 2 * (x - 1 + Math.exp(-x)) / (x * x); }
  function Kx(x) { return x < 1e-4 ? 1 + x * x / 12 : x > 30 ? Math.exp(x - 2 * Math.log(x)) : 2 * (Math.cosh(x) - 1) / (x * x); }

  // weights of the cosine modes of the cell at wave vector q, from the optical kernel (the same projection as the simulation)
  function depthWeights(movie, q) {
    const info = movie.info, K = info.kernel, qk = info.kernel_q, zk = K.z_um, nz = zk.length, nq = qk.length;
    const zlo = info.cell_z_um[0], zhi = info.cell_z_um[1], Lz = zhi - zlo, dz = zk[1] - zk[0], Mz = Math.min(400, Math.floor(Lz / dz));
    let i0 = 0; while (i0 < nq - 2 && qk[i0 + 1] < q) i0++;
    const f = Math.max(0, Math.min(1, (q - qk[i0]) / (qk[i0 + 1] - qk[i0])));
    const Kq = new Float64Array(nz), Kqi = new Float64Array(nz);
    for (let j = 0; j < nz; j++) { Kq[j] = K.Kr[i0 * nz + j] + f * (K.Kr[(i0 + 1) * nz + j] - K.Kr[i0 * nz + j]); Kqi[j] = K.Ki[i0 * nz + j] + f * (K.Ki[(i0 + 1) * nz + j] - K.Ki[i0 * nz + j]); }
    const w = [], k = []; let mx = 0;
    for (let m = 0; m <= Mz; m++) {
      const km = m * Math.PI / Lz; let sr = 0, si = 0;
      for (let j = 0; j < nz; j++) {
        const z = zk[j]; if (z < zlo - 1e-9 || z > zhi + 1e-9) continue;
        const wt = (Math.abs(z - zlo) < dz / 2 || Math.abs(z - zhi) < dz / 2) ? 0.5 * dz : dz, c = (m === 0 ? 1 : Math.SQRT2) * wt * Math.cos(km * (z - zlo));
        sr += c * Kq[j]; si += c * Kqi[j];
      }
      const v = sr * sr + si * si; w.push(v); k.push(km); mx = Math.max(mx, v);
    }
    const W = [], Kz = []; let s = 0;
    for (let m = 0; m < w.length; m++) if (w[m] >= 1e-3 * mx) { W.push(w[m]); Kz.push(k[m]); s += w[m]; }
    return { w: W.map(function (v) { return v / s; }), k: Kz };
  }

  // the model g(dt) for one q at diffusion coefficient D
  function model(D, q, taus, Te, dw, out) {
    for (let l = 0; l < taus.length; l++) out[l] = 0;
    for (let n = 0; n < dw.w.length; n++) {
      const g = D * (q * q + dw.k[n] * dw.k[n]), x = g * Te, s = Te > 0 ? Sx(x) : 1, kk = Te > 0 ? Kx(x) : 1, wn = dw.w[n];
      for (let l = 0; l < taus.length; l++) out[l] += wn * (s - kk * Math.exp(-g * taus[l]));
    }
    return out;
  }
  // fit A and D at one q: y = A g(D), weights wt
  function fitQ(y, wt, q, taus, Te, dw) {
    const g = new Float64Array(taus.length);
    const cost = function (lnD) {
      model(Math.exp(lnD), q, taus, Te, dw, g);
      let sgy = 0, sgg = 0; for (let l = 0; l < y.length; l++) { sgy += wt[l] * g[l] * y[l]; sgg += wt[l] * g[l] * g[l]; }
      const A = sgg > 0 ? sgy / sgg : 0; let c = 0; for (let l = 0; l < y.length; l++) { const r = y[l] - A * g[l]; c += wt[l] * r * r; }
      return { c: c, A: A };
    };
    const lo = Math.log(0.1), hi = Math.log(5000), n = 70; let best = lo, bc = Infinity;
    for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n, c = cost(x).c; if (c < bc) { bc = c; best = x; } }
    let a = best - (hi - lo) / n, b = best + (hi - lo) / n; const r = (Math.sqrt(5) - 1) / 2;
    let x1 = b - r * (b - a), x2 = a + r * (b - a), f1 = cost(x1).c, f2 = cost(x2).c;
    for (let it = 0; it < 40; it++) { if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - r * (b - a); f1 = cost(x1).c; } else { a = x1; x1 = x2; f1 = f2; x2 = a + r * (b - a); f2 = cost(x2).c; } }
    const lnD = (a + b) / 2, e = cost(lnD);
    return { D: Math.exp(lnD), A: e.A, chi2: e.c, atEdge: lnD < lo + 0.05 || lnD > hi - 0.05 };
  }

  /* opts: q_min_per_um, q_max_per_um (null: automatic), amp_q: [lo, hi] (wave vectors whose amplitudes are averaged),
   *       depth (default true), exposure (default true), published_only */
  function* analyse(movie, opts) {
    opts = opts || {};
    const pub = opts.published_only === true, useDepth = !pub && opts.depth !== false, useExpo = !pub && opts.exposure !== false;
    // one movie, or several movies of the same sample (repeats): their structure functions are averaged, and the
    // jackknife leaves out one part of one movie at a time
    const movies = Array.isArray(movie) ? movie : [movie]; movie = movies[0];
    const parts = [];
    for (let i = 0; i < movies.length; i++) {
      const Si = yield* DDM.structure(movies[i], { blocks: 5, windowing: false });
      const Bi = DDM.detectorNoiseB(movies[i]); need(Bi !== null, "the camera noise is needed");
      const jk = []; for (let j = 0; j < Si.blocks; j++) jk.push(Si.jackDq(j));
      parts.push({ S: Si, B: Bi, jack: jk });
      yield { stage: "Comparing frames", frac: (i + 1) / movies.length };
    }
    const S = parts[0].S, R = parts.length;
    const B = parts.reduce(function (p, x) { return p + x.B; }, 0) / R;
    const dq = S.dq.map(function (row, l) { return Float64Array.from(row, function (v, b) { let s = 0; for (let i = 0; i < R; i++) s += parts[i].S.dq[l][b]; return s / R; }); });
    const jack = [];
    for (let i = 0; i < R; i++) for (let j = 0; j < parts[i].S.blocks; j++) {
      jack.push(dq.map(function (row, l) { return Float64Array.from(row, function (v, b) { return v + (parts[i].jack[j][l][b] - parts[i].S.dq[l][b]) / R; }); }));
    }
    const taus = Float64Array.from(S.taus_s), L = taus.length, T = movie.T * R, Te = useExpo ? movie.exposure_s : 0;
    const qStep = S.q_per_um[1], span = taus[L - 1];
    const qMinAuto = 2 * qStep, qMaxAuto = Math.min(movie.q_signal_max_per_um * 0.9, S.q_nyq_per_um * 0.95);
    const qmin = opts.q_min_per_um > 0 ? opts.q_min_per_um : qMinAuto, qmax = opts.q_max_per_um > 0 ? opts.q_max_per_um : qMaxAuto;
    const ampQ = opts.amp_q || [0.6, 2.5];
    const K = jack.length;
    const rows = [];
    const flat = { w: [1], k: [0] };
    for (let b = 1; b <= S.nb; b++) {
      const q = S.q_per_um[b]; if (!(S.nmodes[b] >= 4) || q < qStep * 1.5 || q > S.q_nyq_per_um) continue;
      const row = { b: b, q_per_um: q, nmodes: S.nmodes[b], used: false, reason: null };
      rows.push(row);
      if (q < qmin) { row.reason = "wider than the range analysed"; continue; }
      if (q > qmax) { row.reason = q > movie.q_signal_max_per_um * 0.9 ? "finer than the microscope can see" : "finer than the range analysed"; continue; }
      const dw = useDepth ? depthWeights(movie, q) : flat;
      const y = new Float64Array(L), wt = new Float64Array(L);
      for (let l = 0; l < L; l++) { const d = dq[l][b]; y[l] = d - B; wt[l] = S.nmodes[b] * (T - R * S.lags[l]) / (d * d); }
      const fit = fitQ(y, wt, q, taus, Te, dw);
      row._y = y; row._wt = wt; row._dw = dw; row._yj = [];
      const Dj = [], Aj = [];
      for (let j = 0; j < K; j++) {
        const yj = new Float64Array(L); for (let l = 0; l < L; l++) yj[l] = jack[j][l][b] - B;
        const fj = fitQ(yj, wt, q, taus, Te, dw); Dj.push(Math.log(fj.D)); Aj.push(fj.A); row._yj.push(yj);
      }
      const mD = Dj.reduce(function (p, v) { return p + v; }, 0) / K, mA = Aj.reduce(function (p, v) { return p + v; }, 0) / K;
      let vD = 0, vA = 0; for (let j = 0; j < K; j++) { vD += (Dj[j] - mD) * (Dj[j] - mD); vA += (Aj[j] - mA) * (Aj[j] - mA); }
      row.D_um2_s = fit.D; row.lnD_err = Math.sqrt((K - 1) / K * vD); row.A = fit.A; row.A_err = Math.sqrt((K - 1) / K * vA); row.B = B;
      row.gamma_hz = fit.D * q * q;
      // f relative to what is left to fade: the exposure already blurs part of each pattern (the plateau sum w S(x) < 1)
      const plat = model(fit.D, q, [Infinity], Te, dw, new Float64Array(1))[0] || 1;
      row.f = Array.from(y, function (v) { return fit.A > 0 ? 1 - v / (fit.A * plat) : NaN; });
      row.model_f = Array.from(model(fit.D, q, taus, Te, dw, new Float64Array(L)), function (v) { return 1 - v / plat; });
      row.plateau = plat;
      // the pattern must change within the movie and not entirely within one frame, and the signal must stand out of the noise
      if (fit.atEdge) row.reason = "no decay found";
      else if (!(fit.A > 3 * row.A_err) || !(fit.A > 0)) row.reason = "signal lost in camera noise";
      else if (row.gamma_hz < 2 / span) row.reason = "slower than half the movie";
      else if (row.gamma_hz * (taus[0]) > 3) row.reason = "faster than one frame";
      else if (!(row.lnD_err < 0.5)) row.reason = "too noisy";
      else row.used = true;
      if ((b & 3) === 0) yield { stage: "Fitting the curves", frac: b / S.nb };
    }
    // D: weighted mean of ln D over the q used, leaving out q more than 3 times off the median
    let used = rows.filter(function (r) { return r.used; });
    if (used.length >= 3) {
      const med = used.map(function (r) { return Math.log(r.D_um2_s); }).sort(function (a, b) { return a - b; })[Math.floor(used.length / 2)];
      used.forEach(function (r) { if (Math.abs(Math.log(r.D_um2_s) - med) > Math.log(3)) { r.used = false; r.reason = "outlier"; } });
      used = rows.filter(function (r) { return r.used; });
    }
    let D = null, Derr = null;
    if (used.length >= 2) {
      let sw = 0, sx = 0; used.forEach(function (r) { const w = 1 / Math.max(r.lnD_err * r.lnD_err, 1e-6); sw += w; sx += w * Math.log(r.D_um2_s); });
      const m = sx / sw; let chi = 0; used.forEach(function (r) { const w = 1 / Math.max(r.lnD_err * r.lnD_err, 1e-6); chi += w * Math.pow(Math.log(r.D_um2_s) - m, 2); });
      D = Math.exp(m); Derr = Math.sqrt(1 / sw * Math.max(1, chi / (used.length - 1)));
    }
    // amplitude: mean of A over the q used inside the amplitude window, with a jackknife of the mean
    const ampRows = rows.filter(function (r) { return r.A !== undefined && r.q_per_um >= ampQ[0] && r.q_per_um <= ampQ[1] && !(r.reason === "no decay found"); });
    let Amean = null, Arel = null;
    if (ampRows.length >= 2) {
      Amean = ampRows.reduce(function (p, r) { return p + r.A; }, 0) / ampRows.length;
      let v = 0; ampRows.forEach(function (r) { v += r.A_err * r.A_err; }); Arel = Math.sqrt(v) / ampRows.length / Math.abs(Amean);
    }
    // per wave vector, for the maps of the page: amplitude where the fit found one above its noise, the camera noise
    const Aarr = new Float64Array(S.nb + 1), Barr = new Float64Array(S.nb + 1).fill(B), bins = [];
    rows.forEach(function (r) { if (r.A > 0 && r.A > 2 * r.A_err && r.reason !== "no decay found") { Aarr[r.b] = r.A; bins.push(r.b); } });
    return {
      A: Aarr, B: Barr, bins: bins, binOf: S.binOf, n: S.n,
      rows: rows, D_um2_s: D, D_rel_err: Derr, A_mean: Amean, A_rel_err: Arel, amp_q: ampQ, n_amp: ampRows.length, B_camera: B,
      taus_s: Array.from(taus), Te: Te, lags: S.lags, pairs: S.pairs, d2d: S.d2d, dq: dq, repeats: R, nb: S.nb, q_per_um: Array.from(S.q_per_um), nmodes: S.nmodes,
      window: { q_opt_per_um: movie.q_opt_per_um, q_lo_per_um: qMinAuto, q_hi_per_um: qMaxAuto, q_min_used: used.length ? used[0].q_per_um : null, q_max_used: used.length ? used[used.length - 1].q_per_um : null,
                gamma_lo_hz: 2 / span, gamma_hi_hz: 3 / taus[0] },
      depth: useDepth, exposure: useExpo, published_only: pub
    };
  }


  /* amplitude of one movie (or set of repeats) averaged over the amplitude window, with D fixed (from the series line):
   * A by linear least squares at each q, which noise does not bias, then the mean over q; jackknife for its error */
  function amplitudeAt(res, D) {
    const rows = res.rows.filter(function (r) { return r._y && r.q_per_um >= res.amp_q[0] && r.q_per_um <= res.amp_q[1]; });
    if (rows.length < 2 || !(D > 0)) return null;
    const taus = Float64Array.from(res.taus_s), L = taus.length, g = new Float64Array(L);
    const fitA = function (y, wt) { let sgy = 0, sgg = 0; for (let l = 0; l < L; l++) { sgy += wt[l] * g[l] * y[l]; sgg += wt[l] * g[l] * g[l]; } return sgy / sgg; };
    let A = 0; const K = rows[0]._yj.length, Aj = new Float64Array(K);
    rows.forEach(function (r) {
      model(D, r.q_per_um, taus, res.Te, r._dw, g);
      A += fitA(r._y, r._wt) / rows.length;
      for (let j = 0; j < K; j++) Aj[j] += fitA(r._yj[j], r._wt) / rows.length;
    });
    let m = 0; for (let j = 0; j < K; j++) m += Aj[j] / K; let v = 0; for (let j = 0; j < K; j++) v += (Aj[j] - m) * (Aj[j] - m);
    return { A: A, rel_err: Math.sqrt((K - 1) / K * v) / Math.abs(A), n_q: rows.length };
  }
  /* points: [{ c (mg/mL), D, D_rel_err, A, A_rel_err }], M (g/mol), T_C, eta (Pa s) -> D0, kD, A2, Rh */
  function series(points, M, T_C, eta) {
    const line = function (x, y, s) {
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < x.length; i++) { const w = 1 / (s[i] * s[i]); sw += w; sx += w * x[i]; sy += w * y[i]; sxx += w * x[i] * x[i]; sxy += w * x[i] * y[i]; }
      const det = sw * sxx - sx * sx; if (!(det > 0)) return null;
      const a = (sxx * sy - sx * sxy) / det, b = (sw * sxy - sx * sy) / det;
      let chi = 0; for (let i = 0; i < x.length; i++) chi += Math.pow((y[i] - a - b * x[i]) / s[i], 2);
      const sc = x.length > 2 ? Math.max(1, chi / (x.length - 2)) : 1;
      return { a: a, b: b, va: sxx / det * sc, vb: sw / det * sc, cab: -sx / det * sc };
    };
    const pd = points.filter(function (p) { return p.D > 0 && p.D_rel_err > 0; }), pa = points.filter(function (p) { return p.A > 0 && p.A_rel_err > 0; });
    const out = { n_D: pd.length, n_A: pa.length };
    if (pd.length >= 2) {
      const L = line(pd.map(function (p) { return p.c; }), pd.map(function (p) { return p.D; }), pd.map(function (p) { return p.D * p.D_rel_err; }));
      if (L) {
        out.D0 = L.a; out.D0_err = Math.sqrt(L.va);
        out.kD_mL_g = L.b / L.a * 1e3;                       // slope per mg/mL -> mL/g
        out.kD_err = 1e3 * Math.abs(L.b / L.a) * Math.sqrt(L.vb / (L.b * L.b) + L.va / (L.a * L.a) - 2 * L.cab / (L.a * L.b));
        out.Rh_nm = KB * (T_C + 273.15) / (6 * Math.PI * eta * L.a * 1e-12) * 1e9;
        out.lineD = { a: L.a, b: L.b };
      }
    }
    if (pa.length >= 2) {
      const y = pa.map(function (p) { return p.c / p.A; }), s = pa.map(function (p, i) { return y[i] * p.A_rel_err; });
      const L = line(pa.map(function (p) { return p.c; }), y, s);
      if (L) {
        const r = L.b / L.a;                                  // 2 A2 M per mg/mL
        out.A2 = r * 1e3 / (2 * M); out.A2_err = Math.abs(out.A2) * Math.sqrt(L.vb / (L.b * L.b) + L.va / (L.a * L.a) - 2 * L.cab / (L.a * L.b));
        out.lineA = { a: L.a, b: L.b };
      }
    }
    return out;
  }
  return { analyse: analyse, series: series, amplitudeAt: amplitudeAt, depthWeights: depthWeights, _test: { Sx: Sx, Kx: Kx, fitQ: fitQ, model: model } };
});
