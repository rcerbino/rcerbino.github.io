/* DDM microrheology: tracer beads in a material; from the movie to the storage and loss moduli.
 *
 * For tracers that do not interact, with Gaussian displacements (Edera et al., Phys. Rev. Materials 1, 073804, 2017):
 *   d(q, dt) = A(q) [1 - f(q, dt)] + B(q),   f(q, dt) = exp(-q^2 <dr^2(dt)> / 4)   (<dr^2>: in the image plane)
 * so each wave vector gives the mean squared displacement <dr^2(dt)> = -(4 / q^2) ln f, and the generalised
 * Stokes-Einstein relation turns it into the moduli: J(t) = pi a <dr^2(t)>_3D / kT with <dr^2>_3D = 1.5 <dr^2>_2D, and
 * G*(w) = 1 / (i w J^(w)).
 *
 * Steps:
 *   1. structure function (shared with the other DDM pages), each frame first losing its mean brightness when windowed;
 *   2. A(q) = 2 <|F(q)|^2> - B (the whole amplitude, from the mean power: in a solid part of every pattern never changes,
 *      so the plateau of d or the variance in time would miss it); B(q) the camera noise from the photon count;
 *   3. at each q and delay the displacement that gives the measured f, with the depth of field: beads moving along the
 *      optical axis change their image too (fade, as on the sizing page), f = exp(-q^2 <dr^2> / 4) C_q(<dz^2>), <dz^2> =
 *      <dr^2> / 2. Used where f is clearly below 1 (above the noise) and above 0.15, from the fourth q bin up; uncertainty from a jackknife over
 *      ten parts of the movie; the q combined with weights 1 / variance of ln <dr^2>;
 *   4. smooth curve (local quadratic in log-log, half a decade wide), uncertainty from the same jackknife;
 *   5. moduli: the compliance J(t) fitted with a sum of Kelvin-Voigt elements and a free flow, all weights positive (a
 *      discrete retardation spectrum), whose moduli follow exactly; for comparison the local power-law formulas of Mason
 *      (Rheol. Acta 39, 371, 2000), as in the published method. (A direct transform of piecewise-linear J, Evans et al.,
 *      Phys. Rev. E 80, 012501, 2009, rang with the noise of the data and gave negative G'.)
 *   Edera et al. chose A(q) and B(q) by making the displacements from all q agree (an optimisation); here the camera is
 *   known, so B comes from the photon count and A from the mean power, with no optimisation.
 *   opts.published_only ("the plain method", for comparison): A = 2 var - B (the usual estimate, which misses what never
 *      changes during the movie), B at each q from the first delays, no depth of field, q used where <dr^2> < 1 / q^2
 *      (Edera et al.), Mason's formulas. One by one: opts.amplitude "variance", opts.noise "fit", opts.depth false,
 *      opts.inversion "mason".
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  const KB = 1.380649e-23;
  const K = 10;                                   // parts of the movie for the jackknife
  function need(c, m) { if (!c) throw new Error("Microrheology: " + m); }
  function gammaFn(x) {
    const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
    x -= 1; let s = C[0]; for (let i = 1; i < 9; i++) s += C[i] / (x + i);
    const t = x + 7.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * s;
  }

  // weighted local quadratic of y against x around x0 (Gaussian weights of width h): value and slope
  function localQuad(xs, ys, ws, x0, h) {
    let S = [0, 0, 0, 0, 0], Y = [0, 0, 0], n = 0;
    for (let i = 0; i < xs.length; i++) {
      if (!(ws[i] > 0) || !isFinite(ys[i])) continue;
      const dx = xs[i] - x0, g = ws[i] * Math.exp(-0.5 * dx * dx / (h * h)); if (g < 1e-12) continue;
      let p = g; for (let k = 0; k < 5; k++) { S[k] += p; p *= dx; }
      Y[0] += g * ys[i]; Y[1] += g * ys[i] * dx; Y[2] += g * ys[i] * dx * dx; n++;
    }
    if (n < 3) return null;
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const det = function (m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); };
    const D = det(M); if (!(Math.abs(D) > 0)) return null;
    const col = function (j) { return M.map(function (r, i) { const c = r.slice(); c[j] = Y[i]; return c; }); };
    return { y: det(col(0)) / D, slope: det(col(1)) / D };
  }

  /* G*(w) from a creep compliance known at times t_k (J(0) = 0 before the first point, slope 1/eta after the last):
   * Evans et al. 2009, eq. (10). Returns [G', G''] at each w. */
  function evansModuli(t, J, invEta, ws) {
    const N = t.length;
    return ws.map(function (w) {
      // s^2 J^(s) at s = i w: sum of slopes times (e^{-s t_{k-1}} - e^{-s t_k}) + e^{-s t_N} / eta
      let re = 0, im = 0, tp = 0, Jp = 0;
      for (let k = 0; k < N; k++) {
        const sl = (J[k] - Jp) / (t[k] - tp);
        re += sl * (Math.cos(w * tp) - Math.cos(w * t[k])); im += sl * (-Math.sin(w * tp) + Math.sin(w * t[k]));
        tp = t[k]; Jp = J[k];
      }
      re += invEta * Math.cos(w * tp); im += -invEta * Math.sin(w * tp);
      // G* = i w / (re + i im)
      const den = re * re + im * im; return [w * im / den, w * re / den];
    });
  }
  /* Non-negative least squares (Lawson and Hanson): min |E x - f| with x >= 0. E: m rows of n. */
  function nnls(E, f, n) {
    const m = E.length, x = new Float64Array(n), P = new Uint8Array(n);
    const grad = function () { const w = new Float64Array(n); for (let i = 0; i < m; i++) { let r = f[i]; for (let j = 0; j < n; j++) r -= E[i][j] * x[j]; for (let j = 0; j < n; j++) w[j] += E[i][j] * r; } return w; };
    const lsq = function () {      // unconstrained least squares on the passive set
      const idx = []; for (let j = 0; j < n; j++) if (P[j]) idx.push(j);
      const k = idx.length, M = [], v = new Float64Array(k);
      for (let a = 0; a < k; a++) { M.push(new Float64Array(k)); for (let i = 0; i < m; i++) { v[a] += E[i][idx[a]] * f[i]; for (let b = 0; b < k; b++) M[a][b] += E[i][idx[a]] * E[i][idx[b]]; } M[a][a] *= 1 + 1e-10; }
      // Gauss elimination
      for (let c = 0; c < k; c++) { let pv = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r; [M[c], M[pv]] = [M[pv], M[c]]; [v[c], v[pv]] = [v[pv], v[c]]; const d = M[c][c] || 1e-300; for (let r = c + 1; r < k; r++) { const g = M[r][c] / d; for (let q = c; q < k; q++) M[r][q] -= g * M[c][q]; v[r] -= g * v[c]; } }
      const z = new Float64Array(k); for (let c = k - 1; c >= 0; c--) { let t = v[c]; for (let q = c + 1; q < k; q++) t -= M[c][q] * z[q]; z[c] = t / (M[c][c] || 1e-300); }
      const out = new Float64Array(n); idx.forEach(function (j, a) { out[j] = z[a]; }); return out;
    };
    for (let outer = 0; outer < 3 * n; outer++) {
      const w = grad(); let jm = -1, wm = 1e-12;
      for (let j = 0; j < n; j++) if (!P[j] && w[j] > wm) { wm = w[j]; jm = j; }
      if (jm < 0) break;
      P[jm] = 1;
      for (let inner = 0; inner < 3 * n; inner++) {
        const z = lsq(); let ok = true; for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) ok = false;
        if (ok) { for (let j = 0; j < n; j++) x[j] = P[j] ? z[j] : 0; break; }
        let al = Infinity; for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) al = Math.min(al, x[j] / (x[j] - z[j]));
        for (let j = 0; j < n; j++) if (P[j]) { x[j] += al * (z[j] - x[j]); if (x[j] < 1e-15 * (1 + Math.abs(z[j]))) { x[j] = 0; P[j] = 0; } }
      }
    }
    return x;
  }
  /* Compliance as a sum of Kelvin-Voigt elements (spring and dashpot side by side: j_k (1 - exp(-t / lambda_k))) and a
   * free flow t / eta, all weights >= 0, fitted to the measured J(t) with relative errors; retardation times 4 per decade
   * from a tenth of the first delay to ten times the last. Its complex compliance J*(w) = sum j_k / (1 + i w lambda_k) +
   * 1 / (i w eta) gives G* = 1 / J* exactly: moduli that are always physical, without the ringing of a direct transform
   * of noisy data. Returns { G: [[G', G''] per w], eta (Pa s, Infinity when no flow), spectrum }. */
  function spectrumModuli(t, J, relErr, ws) {
    const lam = []; for (let x = Math.log10(t[0] / 10); x <= Math.log10(t[t.length - 1] * 10) + 1e-9; x += 0.25) lam.push(Math.pow(10, x));
    const n = lam.length + 1, E = [], f = [];
    for (let i = 0; i < t.length; i++) {
      const w = 1 / Math.max(0.02, relErr[i] || 0.1), row = new Float64Array(n);
      for (let k = 0; k < lam.length; k++) row[k] = -Math.expm1(-t[i] / lam[k]) / J[i] * w;
      row[lam.length] = t[i] / J[i] * w;
      E.push(row); f.push(w);
    }
    // a light ridge on neighbouring differences keeps the spectrum smooth (rows of their own)
    const rho = 0.3;
    for (let k = 0; k + 1 < lam.length; k++) { const row = new Float64Array(n); const sc = 1 / Math.max(1e-30, J[Math.min(J.length - 1, Math.max(0, Math.round(k * J.length / lam.length)))]); row[k] = rho * sc; row[k + 1] = -rho * sc; E.push(row); f.push(0); }
    const x = nnls(E, f, n), invEta = x[lam.length];
    const G = ws.map(function (w) {
      let re = 0, im = 0;
      for (let k = 0; k < lam.length; k++) { const wl = w * lam[k], d = 1 + wl * wl; re += x[k] / d; im -= x[k] * wl / d; }
      im -= invEta / w;
      const den = re * re + im * im; return [re / den, -im / den];
    });
    return { G: G, eta: invEta > 0 ? 1 / invEta : Infinity, lam: lam, j: Array.from(x.slice(0, lam.length)) };
  }
  // Mason's local power law: |G*| = kT / (pi a <dr^2>_3D(1/w) Gamma(1 + alpha)), G' = |G*| cos(pi alpha / 2), G'' = |G*| sin(..)
  function masonModuli(J, alpha) {
    const al = Math.max(0, Math.min(1, alpha)), g = 1 / (J * gammaFn(1 + al));
    return [g * Math.cos(Math.PI * al / 2), g * Math.sin(Math.PI * al / 2)];
  }

  function* analyse(movie, opts) {
    opts = opts || {};
    const published = opts.published_only === true;
    const noiseMode = published ? "fit" : (opts.noise || "camera");
    const useDepth = published ? false : opts.depth !== false;
    const inversion = published ? "mason" : (opts.inversion || "spectrum");
    const a_um = opts.radius_um; need(a_um > 0, "tracer radius missing");
    const kT = KB * (movie.T_C + 273.15);
    // windowing: each frame first loses its mean brightness, so that the uniform background does not leak into every q
    let mvS = movie;
    if (opts.windowing) {
      const P0 = movie.n * movie.n, fr = new Float32Array(movie.frames.length);
      for (let t = 0; t < movie.T; t++) { const o = t * P0; let m = 0; for (let p = 0; p < P0; p++) m += movie.frames[o + p]; m /= P0; for (let p = 0; p < P0; p++) fr[o + p] = movie.frames[o + p] - m; }
      mvS = Object.assign({}, movie, { frames: fr, fft: null });
    }
    const S = yield* DDM.structure(mvS, Object.assign({}, opts, { blocks: K }));
    const nb = S.nb, L = S.L, taus = S.taus_s, qv = S.q_per_um, dkq = 2 * Math.PI / movie.L_um;
    const winDq2 = S.window ? 2 * 0.603 * dkq * dkq : 0;
    const jack = []; for (let j = 0; j < S.blocks; j++) jack.push(S.jackDq(j));

    // ---- 2. amplitude and noise ---------------------------------------------------------------------------------------
    const camB = noiseMode !== "fit" && !S.sg ? DDM.detectorNoiseB(movie, S.window) : null;
    const A = new Float64Array(nb + 1).fill(NaN), B = new Float64Array(nb + 1).fill(NaN);
    for (let b = 1; b <= nb; b++) {
      if (!(S.nmodes[b] > 0)) continue;
      B[b] = camB !== null ? camB : S.B_est[b];
      A[b] = (published || opts.amplitude === "variance") ? 2 * S.varq[b] - B[b] : 2 * S.powq[b] - B[b];
    }
    // the widest patterns are left out: beads moving up and down change them most (not fully caught by the depth model)
    // In a solid the mean power of each pattern holds a frozen speckle: the beads' resting places, the same in every frame,
    // add up with random phases, so each mode's power is random (exponentially distributed) about its mean, and a ring of a
    // few dozen modes still scatters by 10-20 %. A(q) itself is smooth (the image of one bead times their number), so it is
    // smoothed over q: a quadratic in ln A against q over up to nine neighbouring rings, weighted by their number of modes.
    // Only when much of the signal is frozen (the variance in time well below the mean power), and not across the widest
    // rings, where A changes fast.
    const frozen = (function () { const r = []; for (let b = 4; b <= nb; b++) if (S.nmodes[b] > 0 && S.powq[b] > 0) r.push(S.varq[b] / S.powq[b]); r.sort(function (x, y) { return x - y; }); return r.length ? r[Math.floor(r.length / 2)] < 0.8 : false; })();
    if (!(published || opts.amplitude === "variance") && opts.smooth_amplitude !== false && frozen) {
      const P2 = new Float64Array(nb + 1).fill(NaN);
      for (let b = 1; b <= nb; b++) if (S.nmodes[b] > 0 && 2 * S.powq[b] > 0) P2[b] = Math.log(2 * S.powq[b]);
      const sm = new Float64Array(nb + 1).fill(NaN);
      for (let b = 1; b <= nb; b++) {
        if (!isFinite(P2[b])) continue;
        const xs = [], ys = [], ws = [];
        for (let k = Math.max(3, b - 4); k <= Math.min(nb, b + 4); k++) if (isFinite(P2[k])) { xs.push(k - b); ys.push(P2[k]); ws.push(S.nmodes[k]); }
        const r = localQuad(xs, ys, ws, 0, 100);
        sm[b] = r ? r.y : P2[b];
      }
      for (let b = 1; b <= nb; b++) if (isFinite(sm[b])) A[b] = Math.exp(sm[b]) - B[b];
    }
    const qmin = Math.max(4 * S.q_lo_per_um, opts.q_min_per_um || 0), qmax = Math.min(S.q_hi_per_um, opts.q_max_per_um || Infinity);
    const bins = []; for (let b = 1; b <= nb; b++) if (S.nmodes[b] > 0 && qv[b] >= qmin && qv[b] <= qmax && A[b] > 0) bins.push(b);
    need(bins.length >= 3, "too few wave vectors in the measurable range");
    yield { stage: "From each pattern to a displacement", frac: 0.1 };

    // ---- 3. displacement at each q and delay -------------------------------------------------------------------------
    // the fade of the image of beads moving along the optical axis, tabulated against <dz^2> for each q used
    const info = movie.info, depthOn = useDepth && info && info.kernel && info.kernel_q && info.cell_z_um && DDM._test && DDM._test.depthC;
    const NX = 160, LM0 = Math.log(1e-7), LM1 = Math.log(1e3);
    const fwd = {};                  // per bin: f at log-spaced <dr^2> (decreasing), for the inversion
    bins.forEach(function (b) {
      const q2 = qv[b] * qv[b] + winDq2, tb = depthOn ? DDM._test.depthC(info, qv[b]) : null, tab = new Float64Array(NX + 1);
      for (let i = 0; i <= NX; i++) { const M = Math.exp(LM0 + (LM1 - LM0) * i / NX); tab[i] = Math.exp(-q2 * M / 4) * (tb ? DDM._test.depthFade(tb, M / 4, 1) : 1); }
      for (let i = 1; i <= NX; i++) if (tab[i] > tab[i - 1]) tab[i] = tab[i - 1];   // keep it monotonic
      fwd[b] = tab;
    });
    const invert = function (b, f) {      // <dr^2> (um^2) that gives f, or NaN
      const tab = fwd[b]; if (!(f < tab[0]) || !(f > tab[NX])) return NaN;
      let lo = 0, hi = NX; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] > f) lo = m; else hi = m; }
      const fr = (Math.log(f) - Math.log(tab[lo])) / (Math.log(tab[hi]) - Math.log(tab[lo]));
      return Math.exp(LM0 + (LM1 - LM0) * (lo + (isFinite(fr) ? fr : 0.5)) / NX);
    };
    // f and its noise at each used q and delay; the noise of d from the jackknife over the parts of the movie
    const fq = {}, sfq = {};
    bins.forEach(function (b) {
      const f = new Float64Array(L), sf = new Float64Array(L);
      for (let li = 0; li < L; li++) {
        const d = S.dq[li][b]; f[li] = 1 - (d - B[b]) / A[b];
        let m = 0; for (let j = 0; j < jack.length; j++) m += jack[j][li][b]; m /= jack.length;
        let v = 0; for (let j = 0; j < jack.length; j++) v += (jack[j][li][b] - m) * (jack[j][li][b] - m);
        sf[li] = Math.sqrt(v * (jack.length - 1) / jack.length) / A[b];
      }
      fq[b] = f; sfq[b] = sf;
    });
    yield { stage: "From each pattern to a displacement", frac: 0.4 };

    // usable points: f clearly below 1 (3 times its noise) and above 0.05; published: <dr^2> < 1 / q^2 (Edera et al.)
    const msdQ = {}, wQ = {};
    const lnMsdFrom = function (dqAt, b, li) { const f = 1 - (dqAt[li][b] - B[b]) / A[b]; const M = invert(b, f); return M > 0 ? Math.log(M) : NaN; };
    bins.forEach(function (b) {
      const m = new Float64Array(L).fill(NaN), w = new Float64Array(L);
      for (let li = 0; li < L; li++) {
        const f = fq[b][li], sf = Math.max(sfq[b][li], 1e-4);
        if (!(f < 1 - Math.max(3 * sf, 0.01) && f > 0.15)) continue;   // a change of 1 % at least: A is not known better
        const M = invert(b, f); if (!(M > 0)) continue;
        if (published && !(M < 1 / (qv[b] * qv[b]))) continue;
        const sl = sf / (f * Math.max(1e-3, -Math.log(f)));           // noise of ln <dr^2>
        if (sl > 0.35) continue;
        m[li] = Math.log(M); w[li] = 1 / (sl * sl + 0.0004);
      }
      msdQ[b] = m; wQ[b] = w;
    });
    // combined over q at each delay (at least three q, so that no single pattern decides)
    const combine = function (lnAt) {
      const out = new Float64Array(L).fill(NaN), nq = new Int32Array(L);
      for (let li = 0; li < L; li++) {
        let s = 0, ws = 0, c = 0;
        bins.forEach(function (b) { const w = wQ[b][li]; if (w > 0) { const v = lnAt(b, li); if (isFinite(v)) { s += w * v; ws += w; c++; } } });
        if (c >= 3) { out[li] = s / ws; nq[li] = c; }
      }
      return { ln: out, nq: nq };
    };
    const full = combine(function (b, li) { return msdQ[b][li]; });
    const reps = jack.map(function (dj) { return combine(function (b, li) { return lnMsdFrom(dj, b, li); }).ln; });
    const sdLn = new Float64Array(L).fill(NaN);
    for (let li = 0; li < L; li++) {
      if (!isFinite(full.ln[li])) continue;
      const v = reps.map(function (r) { return r[li]; }).filter(isFinite); if (v.length < 3) continue;
      const m = v.reduce(function (a, x) { return a + x; }, 0) / v.length;
      sdLn[li] = Math.sqrt(v.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) * (v.length - 1) / v.length);
    }
    yield { stage: "Mean squared displacement", frac: 0.6 };

    // ---- 4. smooth curve ----------------------------------------------------------------------------------------------
    const pts = []; for (let li = 0; li < L; li++) if (isFinite(full.ln[li])) pts.push(li);
    need(pts.length >= 5, "too few delays where the beads have moved measurably: try longer movies, smaller beads or finer patterns");
    const lx = pts.map(function (li) { return Math.log(taus[li]); });
    const smoothOf = function (lnArr) {
      const ys = pts.map(function (li) { return lnArr[li]; }), ws = pts.map(function (li) { return isFinite(lnArr[li]) ? 1 / Math.max(0.0025, (sdLn[li] || 0.05) * (sdLn[li] || 0.05)) : 0; });
      return pts.map(function (li, k) { const r = localQuad(lx, ys, ws, lx[k], 0.5 * Math.LN10 / 2); return r ? r : { y: ys[k], slope: NaN }; });
    };
    const sm = smoothOf(full.ln);
    const tS = pts.map(function (li) { return taus[li]; });
    const relErrS = pts.map(function (li) { return isFinite(sdLn[li]) ? sdLn[li] : 0.1; });
    const msdS = sm.map(function (r) { return Math.exp(r.y); }), alpha = sm.map(function (r) { return r.slope; });

    // ---- 5. moduli -----------------------------------------------------------------------------------------------------
    const Jof = function (m2d) { return Math.PI * a_um * 1e-6 * 1.5 * m2d * 1e-12 / kT; };   // 1/Pa
    const nW = 40, wLo = 1 / tS[tS.length - 1], wHi = 1 / tS[0];
    const ws = []; for (let i = 0; i < nW; i++) ws.push(wLo * Math.pow(wHi / wLo, i / (nW - 1)));
    const modsFrom = function (msdArr, alphaArr, kind) {
      const J = msdArr.map(Jof);
      if (kind === "mason") return ws.map(function (w) {
        // interpolate J and alpha at t = 1 / w (log-log)
        const t = 1 / w; let k = 0; while (k < tS.length - 2 && tS[k + 1] < t) k++;
        const fr = Math.max(0, Math.min(1, Math.log(t / tS[k]) / Math.log(tS[k + 1] / tS[k])));
        const Jt = Math.exp(Math.log(J[k]) + fr * (Math.log(J[k + 1]) - Math.log(J[k]))), al = (isFinite(alphaArr[k]) ? alphaArr[k] : 0.5) * (1 - fr) + (isFinite(alphaArr[k + 1]) ? alphaArr[k + 1] : 0.5) * fr;
        return masonModuli(Jt, al);
      });
      return spectrumModuli(tS, J, tS.map(function (t, k) { return relErrS[k]; }), ws).G;
    };
    const mods = modsFrom(msdS, alpha, inversion);
    const masonM = modsFrom(msdS, alpha, "mason");
    // jackknife of the moduli
    const repMods = reps.map(function (r) { const s = smoothOf(r); return modsFrom(s.map(function (x) { return Math.exp(x.y); }), s.map(function (x) { return x.slope; }), inversion); });
    const errOf = function (k, c) {
      const v = repMods.map(function (m) { return Math.log(Math.abs(m[k][c])); }).filter(isFinite); if (v.length < 3) return NaN;
      const m = v.reduce(function (a, x) { return a + x; }, 0) / v.length;
      return Math.sqrt(v.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) * (v.length - 1) / v.length);   // in ln
    };
    const Gp = mods.map(function (m) { return m[0]; }), Gpp = mods.map(function (m) { return m[1]; });
    const GpErr = mods.map(function (m, k) { return errOf(k, 0); }), GppErr = mods.map(function (m, k) { return errOf(k, 1); });
    // where G' = G'' within the range measured
    const cross = [];
    for (let k = 1; k < nW; k++) {
      const d0 = Math.log(Gp[k - 1] / Gpp[k - 1]), d1 = Math.log(Gp[k] / Gpp[k]);
      if (isFinite(d0) && isFinite(d1) && (d0 > 0) !== (d1 > 0)) { const f = d0 / (d0 - d1); cross.push({ w: ws[k - 1] * Math.pow(ws[k] / ws[k - 1], f), elastic_above: d1 > 0 }); }
    }
    // long-time behaviour: free (viscosity) or caged (plateau)
    const aEnd = alpha[alpha.length - 1], nE = Math.max(1, Math.floor(alpha.length / 6));
    let aEndMean = 0; for (let k = alpha.length - nE; k < alpha.length; k++) aEndMean += (isFinite(alpha[k]) ? alpha[k] : aEnd) / nE;
    let etaLong = null;
    if (aEndMean > 0.85) {      // free diffusion at the end: <dr^2>_2D = 4 D t over the last half decade, D = kT / (6 pi eta a)
      let sD = 0, c = 0; for (let k = tS.length - 1; k >= 0 && tS[tS.length - 1] / tS[k] < Math.sqrt(10); k--) { sD += msdS[k] / (4 * tS[k]); c++; }
      etaLong = kT / (6 * Math.PI * a_um * 1e-6 * (sD / c) * 1e-12);
    }
    const plateau = aEndMean < 0.15 ? 1 / Jof(msdS[msdS.length - 1]) : null;
    yield { stage: "Moduli", frac: 1 };

    return {
      published: published, inversion: inversion, noise: noiseMode, depth: !!depthOn, radius_um: a_um,
      n: S.n, lags: S.lags, taus_s: taus, pairs: S.pairs, q_per_um: Array.from(qv), d2d: S.d2d, dq: S.dq.map(function (r) { return Array.from(r); }),
      A: Array.from(A), B: Array.from(B), B_camera: camB, bins: bins,
      f: bins.map(function (b) { return Array.from(fq[b]); }), f_err: bins.map(function (b) { return Array.from(sfq[b]); }),
      msd_q: bins.map(function (b) { return Array.from(msdQ[b]).map(function (x) { return isFinite(x) ? Math.exp(x) : null; }); }),
      msd: { t_s: Array.from(taus), m_um2: Array.from(full.ln).map(function (x) { return isFinite(x) ? Math.exp(x) : null; }), err_ln: Array.from(sdLn).map(function (x) { return isFinite(x) ? x : null; }), n_q: Array.from(full.nq) },
      smooth: { t_s: tS, m_um2: msdS, alpha: alpha },
      w_rad_s: ws, Gp_Pa: Gp, Gpp_Pa: Gpp, Gp_err_ln: GpErr, Gpp_err_ln: GppErr,
      mason: { Gp_Pa: masonM.map(function (m) { return m[0]; }), Gpp_Pa: masonM.map(function (m) { return m[1]; }) },
      crossings: cross, alpha_end: aEndMean, eta_long_Pa_s: etaLong, plateau_Pa: plateau,
      binOf: S.binOf, times_s: S.times_s,
      window: { q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um, q_opt_per_um: S.q_opt_per_um, q_min_used: qv[bins[0]], q_max_used: qv[bins[bins.length - 1]], t_lo_s: tS[0], t_hi_s: tS[tS.length - 1],
                msd_lo_um2: Math.min.apply(null, msdS), msd_hi_um2: Math.max.apply(null, msdS) }
    };
  }
  function publishedSummary(r) { return { Gp_Pa: r.Gp_Pa, Gpp_Pa: r.Gpp_Pa, w_rad_s: r.w_rad_s, crossings: r.crossings, eta_long_Pa_s: r.eta_long_Pa_s, plateau_Pa: r.plateau_Pa, smooth: r.smooth }; }

  const api = { analyse: analyse, publishedSummary: publishedSummary, _test: { evansModuli: evansModuli, spectrumModuli: spectrumModuli, nnls: nnls, masonModuli: masonModuli, localQuad: localQuad } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RHEO = api;
})(typeof self !== "undefined" ? self : this);
