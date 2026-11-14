/* DDM of particles that diffuse and drift (flow, sedimentation, thermophoresis): analysis.
 *
 * Model (independent particles, drift v in the image plane):
 *   F(q, t + dt) F*(q, t) averaged over t  =  (A(q) / 2) exp(-D q^2 dt) exp(-i q.v dt)        (no noise at dt > 0)
 *   d(q, dt) = <|F(q, t + dt) - F(q, t)|^2>  =  A(q) [1 - exp(-D q^2 dt) cos(q.v dt)] + B(q)
 * The structure function d keeps only cos(q.v dt): it gives the speed but not the sign of v. The phase of the
 * frame-to-frame cross spectrum C(q, dt) = <F(q, t + dt) F*(q, t)> is -q.v dt (sign included).
 *
 * Steps:
 *   1. structure function (shared with the other DDM pages) and C(q, dt) on the same pairs of frames;
 *   2. first guess of v from the phase of C: neighbouring Fourier pixels differ in phase by -dq v dt
 *      (robust to phase wrapping as long as the particles moved less than half the field);
 *   3. first guess of D: one-parameter search with v fixed;
 *   4. global fit of D, vx, vy to d(q, dt) in sectors of q (12 directions), with A and B of each q found by
 *      linear least squares at every step (B fixed when the camera noise is known);
 *   5. fit at each q alone (rate Gamma = D q^2 of the fading, frequency omega = q v of the oscillation along v),
 *      for the plots and for the uncertainties (scatter between q);
 *   6. visibility: where can the drift be seen at all (q v dt reaching 1 before diffusion erases the pattern).
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  const NSEC = 12;                                   // sectors of q direction over [0, pi)
  const KB = 1.380649e-23;

  function need(c, m) { if (!c) throw new Error("Drift analysis: " + m); }

  // Nelder-Mead on a few parameters (small, robust: the cost is cheap to evaluate and has no derivatives)
  function nelderMead(f, x0, step, iters) {
    const n = x0.length; let pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; pts.push(p); }
    let vals = pts.map(f);
    for (let it = 0; it < (iters || 300); it++) {
      const ord = vals.map(function (v, i) { return i; }).sort(function (a, b) { return vals[a] - vals[b]; });
      pts = ord.map(function (i) { return pts[i]; }); vals = ord.map(function (i) { return vals[i]; });
      if (Math.abs(vals[n] - vals[0]) <= 1e-10 * (Math.abs(vals[0]) + 1e-30)) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
      const at = function (t) { return c.map(function (cj, j) { return cj + t * (pts[n][j] - cj); }); };
      const xr = at(-1), fr = f(xr);
      if (fr < vals[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
      else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
      else {
        const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc);
        if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
        else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map(function (v, j) { return pts[0][j] + 0.5 * (v - pts[0][j]); }); vals[i] = f(pts[i]); }
      }
    }
    let best = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[best]) best = i;
    return { x: pts[best], f: vals[best] };
  }

  function* analyse(movie, opts) {
    opts = opts || {};
    const S = yield* DDM.structure(movie, opts);
    const n = S.n, P = S.P, T = S.T, L = S.L, fft = S.fft, taus = S.taus_s, nb = S.nb, binOf = S.binOf;
    const dkq = 2 * Math.PI / movie.L_um;                               // q step (1/um)

    // ---- 1. cross spectrum C(q, dt) on the pairs of the structure function ------------------------------------
    // C is also kept apart for K blocks of the movie (a pair counts in the block of its first frame) at about ten
    // lags, so that the phase fit can be repeated with one block left out (jackknife uncertainty of v)
    const K = 5, blockOf = function (t) { return Math.min(K - 1, Math.floor(t * K / T)); };
    const phaseLags = []; for (let li = 0; li < L; li += Math.max(1, Math.floor(L / 10))) phaseLags.push(li);
    const C = [], CB = {};                                              // C per lag: Float32Array(2P), normalised by P
    for (let li = 0; li < L; li++) {
      const m = S.lags[li], pr = S.pairs ? S.pairs[li] : null, np = pr ? pr.length / 2 : T - m;
      const keepB = phaseLags.indexOf(li) >= 0, nB = keepB ? K : 1;
      const re = [], im = [], cnt = new Float64Array(nB);
      for (let k = 0; k < nB; k++) { re.push(new Float64Array(P)); im.push(new Float64Array(P)); }
      for (let k = 0; k < np; k++) {
        const t1 = pr ? pr[2 * k] : k, t2 = pr ? pr[2 * k + 1] : k + m, o1 = 2 * P * t1, o2 = 2 * P * t2;
        const kb = keepB ? blockOf(t1) : 0, rr = re[kb], ii = im[kb]; cnt[kb]++;
        for (let p = 0; p < P; p++) {
          const ar = fft[o2 + 2 * p], ai = fft[o2 + 2 * p + 1], br = fft[o1 + 2 * p], bi = fft[o1 + 2 * p + 1];
          rr[p] += ar * br + ai * bi; ii[p] += ai * br - ar * bi;           // F2 conj(F1)
        }
      }
      const c = new Float32Array(2 * P), tot = cnt.reduce(function (a, v) { return a + v; }, 0);
      for (let p = 0; p < P; p++) { let sr = 0, si = 0; for (let k = 0; k < nB; k++) { sr += re[k][p]; si += im[k][p]; } c[2 * p] = sr / tot / P; c[2 * p + 1] = si / tot / P; }
      C.push(c);
      if (keepB) {   // per block: the sums, as Float32 to save memory
        CB[li] = { cnt: cnt, re: re.map(function (a) { return Float32Array.from(a); }), im: im.map(function (a) { return Float32Array.from(a); }) };
      }
      yield { stage: "Cross spectrum of the frames", frac: (li + 1) / L };
    }
    // C at a phase lag with block j left out (j = -1: all blocks)
    const cWithout = function (li, j) {
      const B = CB[li], c = new Float64Array(2 * P); let tot = 0;
      for (let k = 0; k < K; k++) { if (k === j) continue; tot += B.cnt[k]; const r = B.re[k], i = B.im[k]; for (let p = 0; p < P; p++) { c[2 * p] += r[p]; c[2 * p + 1] += i[p]; } }
      if (!(tot > 0)) return null;
      for (let p = 0; p < 2 * P; p++) c[p] /= tot * P;
      return c;
    };

    // camera noise (the same at every q) when the detector is known; otherwise B per q is fitted
    const noiseB = opts.noise !== "fit" && !S.sg ? DDM.detectorNoiseB(movie, S.window) : null;

    // wave vector of each Fourier pixel
    const KX = new Float64Array(P), KY = new Float64Array(P);
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
      const p = iy * n + ix; KX[p] = (ix < n / 2 ? ix : ix - n) * dkq; KY[p] = (iy < n / 2 ? iy : iy - n) * dkq;
    }
    // q bins used: above the widest patterns, below the optics; and rates the movie can follow (checked per bin later)
    const qmin = Math.max(2 * S.q_lo_per_um, opts.q_min_per_um || 0), qmax = Math.min(S.q_hi_per_um, opts.q_max_per_um || Infinity);
    const binsUsed = [];
    for (let b = 1; b <= nb; b++) if (S.nmodes[b] > 0 && S.q_per_um[b] >= qmin && S.q_per_um[b] <= qmax) binsUsed.push(b);
    need(binsUsed.length >= 4, "too few wave vectors in the measurable range");

    // ---- 2. first guess of v from the phase of C (neighbouring pixels) -----------------------------------------
    // sum over pixels of C(q + dkx) C*(q): its phase is -dkq vx dt (same for y). Lags where the pattern is still
    // there (coherence above 0.3) and the drift moved the pattern less than half the field.
    const phaseV = [];
    for (let li = 0; li < L; li++) {
      const c = C[li]; let sxr = 0, sxi = 0, syr = 0, syi = 0, nx = 0;
      for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
        const p = iy * n + ix, b = binOf[p]; if (b <= 0 || S.q_per_um[b] > qmax) continue;
        const px = iy * n + ((ix + 1) % n), py = ((iy + 1) % n) * n + ix;
        const ar = c[2 * p], ai = c[2 * p + 1];
        if (binOf[px] > 0) { const br = c[2 * px], bi = c[2 * px + 1]; sxr += br * ar + bi * ai; sxi += bi * ar - br * ai; nx += Math.hypot(ar, ai) * Math.hypot(br, bi); }
        if (binOf[py] > 0) { const br = c[2 * py], bi = c[2 * py + 1]; syr += br * ar + bi * ai; syi += bi * ar - br * ai; }
      }
      const coh = nx > 0 ? Math.hypot(sxr, sxi) / nx : 0;
      phaseV.push({ tau: taus[li], vx: -Math.atan2(sxi, sxr) / (dkq * taus[li]), vy: -Math.atan2(syi, syr) / (dkq * taus[li]), coh: coh });
    }
    let v0x = 0, v0y = 0, wsum = 0;
    for (const e of phaseV) {
      const half = 0.5 * movie.L_um;                                    // displacement below half the field
      if (e.coh < 0.3 || Math.hypot(e.vx, e.vy) * e.tau > half) continue;
      const w = e.coh * e.coh * e.tau;                                  // longer lags: the phase grows with dt
      v0x += w * e.vx; v0y += w * e.vy; wsum += w;
    }
    if (wsum > 0) { v0x /= wsum; v0y /= wsum; }
    // weighted least squares on the phase of each Fourier pixel: phase = -(qx vx + qy vy) dt, weights |C|^2, over the
    // pixels where C is still clearly there (at least a fifth of A/2) and the predicted phase stays within +-1.2 rad
    // (no wrapping); repeated a few times as v improves
    const ampRef = new Float64Array(nb + 1);
    for (let b = 1; b <= nb; b++) ampRef[b] = Math.max(0, 2 * S.varq[b] - (S.B_est[b] || 0)) / 2;
    const phaseFit = function (getC, vxs, vys) {
      let vx = vxs, vy = vys, used = 0;
      for (let it = 0; it < 6; it++) {
        let a11 = 0, a12 = 0, a22 = 0, r1 = 0, r2 = 0; used = 0;
        for (const li of phaseLags) {
          const c = getC(li); if (!c) continue; const t = taus[li];
          for (let p = 0; p < P; p++) {
            const b = binOf[p]; if (b <= 0 || S.q_per_um[b] < qmin || S.q_per_um[b] > qmax) continue;
            const re = c[2 * p], im = c[2 * p + 1], a2 = re * re + im * im;
            if (a2 < 0.04 * ampRef[b] * ampRef[b]) continue;
            const x1 = -KX[p] * t, x2 = -KY[p] * t, pred = x1 * vx + x2 * vy;
            if (Math.abs(pred) > 1.2) continue;
            let ph = Math.atan2(im, re) - pred; ph -= 2 * Math.PI * Math.round(ph / (2 * Math.PI)); ph += pred;
            a11 += a2 * x1 * x1; a12 += a2 * x1 * x2; a22 += a2 * x2 * x2; r1 += a2 * x1 * ph; r2 += a2 * x2 * ph; used++;
          }
        }
        const det = a11 * a22 - a12 * a12; if (!(det > 0)) break;
        vx = (r1 * a22 - r2 * a12) / det; vy = (a11 * r2 - a12 * r1) / det;
      }
      return { vx: vx, vy: vy, n: used };
    };
    const ph0 = phaseFit(function (li) { return C[li]; }, v0x, v0y);
    const jk = [];
    for (let j = 0; j < K; j++) { const r = phaseFit(function (li) { return cWithout(li, j); }, ph0.vx, ph0.vy); jk.push(r); }
    const jmx = jk.reduce(function (a, r) { return a + r.vx; }, 0) / K, jmy = jk.reduce(function (a, r) { return a + r.vy; }, 0) / K;
    const vxErr = Math.sqrt((K - 1) / K * jk.reduce(function (a, r) { return a + (r.vx - jmx) * (r.vx - jmx); }, 0));
    const vyErr = Math.sqrt((K - 1) / K * jk.reduce(function (a, r) { return a + (r.vy - jmy) * (r.vy - jmy); }, 0));

    // ---- data in sectors: (bin, sector) groups of pixels, folded onto [0, pi) (d is even in q) -----------------
    const groups = [];                                                 // { b, s, px: [qx], py: [qy], d: Float64Array(L) }
    const gIndex = new Map();
    for (let p = 0; p < P; p++) {
      const b = binOf[p]; if (b <= 0 || binsUsed.indexOf(b) < 0) continue;
      let th = Math.atan2(KY[p], KX[p]); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI;
      const s = Math.min(NSEC - 1, Math.floor(th / Math.PI * NSEC)), key = b * NSEC + s;
      let g = gIndex.get(key);
      if (!g) { g = { b: b, s: s, q: S.q_per_um[b], qx: [], qy: [], d: new Float64Array(L) }; gIndex.set(key, g); groups.push(g); }
      g.qx.push(KX[p]); g.qy.push(KY[p]);
      for (let li = 0; li < L; li++) g.d[li] += S.d2d[li][p];
    }
    groups.forEach(function (g) { for (let li = 0; li < L; li++) g.d[li] /= g.qx.length; g.w = g.qx.length; });
    const byBin = new Map(); groups.forEach(function (g) { if (!byBin.has(g.b)) byBin.set(g.b, []); byBin.get(g.b).push(g); });

    // model of one group: d = B + A (1 - exp(-D q^2 dt) <cos(q.v dt)>), <> over the pixels of the group
    const decayOf = function (g, D, vx, vy, out) {
      const m = g.qx.length;
      for (let li = 0; li < L; li++) {
        const t = taus[li]; let cs = 0;
        for (let k = 0; k < m; k++) cs += Math.cos((g.qx[k] * vx + g.qy[k] * vy) * t);
        out[li] = Math.exp(-D * g.q * g.q * t) * cs / m;
      }
      return out;
    };
    // for one bin and (D, v): best A (and B unless known) by linear least squares; returns the weighted cost
    const gbuf = new Float64Array(L);
    const binCost = function (b, D, vx, vy, keep) {
      const gs = byBin.get(b); let s11 = 0, s12 = 0, s22 = 0, r1 = 0, r2 = 0;
      const scale = 2 * S.varq[b], wgt = 1 / (scale * scale);
      const cols = gs.map(function (g) { const e = decayOf(g, D, vx, vy, new Float64Array(L)); return e; });
      gs.forEach(function (g, gi) {
        const e = cols[gi];
        for (let li = 0; li < L; li++) { const x = 1 - e[li], y = g.d[li] - (noiseB !== null ? noiseB : 0), w = g.w;
          s11 += w * x * x; s12 += w * x; s22 += w; r1 += w * x * y; r2 += w * y; }
      });
      let A, B;
      if (noiseB !== null) { A = s11 > 0 ? r1 / s11 : 0; B = noiseB; }
      else { const det = s11 * s22 - s12 * s12; A = det > 0 ? (r1 * s22 - r2 * s12) / det : 0; B = det > 0 ? (s11 * r2 - s12 * r1) / det : 0; B = Math.max(0, B); }
      let cost = 0;
      gs.forEach(function (g, gi) { const e = cols[gi]; for (let li = 0; li < L; li++) { const r = g.d[li] - B - A * (1 - e[li]); cost += g.w * r * r * wgt; } });
      if (keep) keep.push({ b: b, A: A, B: B });
      return cost;
    };
    const totalCost = function (D, vx, vy, bins) { let c = 0; for (const b of bins) c += binCost(b, D, vx, vy); return c; };

    // ---- 3. first guess of D with v fixed (search on a log grid, then a golden refinement) ---------------------
    yield { stage: "Fitting diffusion and drift", frac: 0.1 };
    // the rates the movie can follow: D q^2 between 1 / (longest delay) and 1 / (shortest delay) at the middle q
    const qm = S.q_per_um[binsUsed[Math.floor(binsUsed.length / 2)]];
    let bestD = null, bestC = Infinity;
    for (let k = 0; k <= 40; k++) {
      const D = Math.pow(10, Math.log10(0.3 / (qm * qm * taus[L - 1])) + k / 40 * Math.log10((3 / taus[0]) / (0.3 / taus[L - 1])));
      const c = totalCost(D, ph0.vx, ph0.vy, binsUsed); if (c < bestC) { bestC = c; bestD = D; }
    }

    // ---- 4. global fit of ln D, vx, vy -------------------------------------------------------------------------
    // D: the structure function with v fixed at the phase result (the phase measures v without any model of the decay)
    const fD = nelderMead(function (x) { return totalCost(Math.exp(x[0]), ph0.vx, ph0.vy, binsUsed); }, [Math.log(bestD)], [0.2], 200);
    const D = Math.exp(fD.x[0]), vx = ph0.vx, vy = ph0.vy;
    // for comparison: D and v from the structure function alone (it has cos(q.v dt) only: no sign, and it can trade
    // drift against diffusion when the pattern fades before it oscillates)
    const vScale = Math.max(Math.hypot(vx, vy), D * qm, 1e-3);
    const fitSF = nelderMead(function (x) { return totalCost(Math.exp(x[0]), x[1], x[2], binsUsed); },
      [Math.log(D), vx, vy], [0.2, 0.2 * vScale, 0.2 * vScale], 400);
    const sf = { D_um2_s: Math.exp(fitSF.x[0]), v_um_s: Math.hypot(fitSF.x[1], fitSF.x[2]), v_dir_deg: Math.atan2(fitSF.x[2], fitSF.x[1]) * 180 / Math.PI };
    const bins = []; binsUsed.forEach(function (b) { binCost(b, D, vx, vy, bins); });
    yield { stage: "Fitting each q", frac: 0.6 };

    // ---- 5. fit at each q alone: Gamma (fading) and omega (oscillation along v) --------------------------------
    const speed = Math.hypot(vx, vy), dir = speed > 0 ? [vx / speed, vy / speed] : [1, 0];
    const perQ = binsUsed.map(function (b) {
      const q = S.q_per_um[b];
      const f1 = nelderMead(function (x) { const G = Math.exp(x[0]), w = x[1]; return binCost(b, G / (q * q), w / q * dir[0], w / q * dir[1]); },
        [Math.log(D * q * q), speed * q], [0.3, 0.3 * Math.max(speed * q, 0.3 * D * q * q)], 200);
      const G = Math.exp(f1.x[0]), w = Math.abs(f1.x[1]);
      const ok = G > 0.5 / taus[L - 1] && G < 2 / taus[0];
      return { b: b, q_per_um: q, gamma_hz: G, omega_rad_s: w, ok: ok };
    });
    const okQ = perQ.filter(function (e) { return e.ok; });
    const spreadOf = function (vals) {
      if (vals.length < 3) return null;
      const m = vals.reduce(function (a, c) { return a + c; }, 0) / vals.length;
      const s = Math.sqrt(vals.reduce(function (a, c) { return a + (c - m) * (c - m); }, 0) / (vals.length - 1));
      return s / Math.sqrt(vals.length);
    };
    const D_err = spreadOf(okQ.map(function (e) { return e.gamma_hz / (e.q_per_um * e.q_per_um); }));
    // uncertainty of v: jackknife over five parts of the movie, along v (speed) and across it (direction)
    const v_err = speed > 0 ? Math.abs(vxErr * dir[0]) + Math.abs(vyErr * dir[1]) : Math.hypot(vxErr, vyErr);
    const dir_err_deg = speed > 0 ? (Math.abs(vxErr * dir[1]) + Math.abs(vyErr * dir[0])) / speed * 180 / Math.PI : null;

    // ---- 6. can the drift be seen? ------------------------------------------------------------------------------
    // the pattern at q oscillates (q v dt about 1) before diffusion erases it (D q^2 dt about 2) when q < 2 v / D,
    // and within the movie when q v (longest delay) > 1. Widest and finest q used bound what is available.
    const qLo = S.q_per_um[binsUsed[0]], qHi = S.q_per_um[binsUsed[binsUsed.length - 1]];
    const visibility = function (v, Dv) {
      const a = Math.max(qLo, 1 / (v * taus[L - 1])), z = Math.min(qHi, 2 * v / Dv);
      const nq = binsUsed.filter(function (b) { const q = S.q_per_um[b]; return q >= a && q <= z; }).length;
      return { q_from: a, q_to: z, n_q: nq, visible: nq >= 3, q_star: v / Dv, peclet: v * movie.L_um / Dv };
    };
    const vis = visibility(Math.max(speed, 1e-9), D);
    const detected = vis.visible && speed > 3 * Math.max(Math.hypot(vxErr, vyErr), 1e-12);

    // ---- outputs for the page ------------------------------------------------------------------------------------
    // sector curves along and across the drift (normalised: f = 1 - (d - B) / A), per bin
    const along = [], across = [];
    const angV = Math.atan2(vy, vx);
    bins.forEach(function (e) {
      const gs = byBin.get(e.b); const fa = new Float64Array(L), fc = new Float64Array(L); let na = 0, nc = 0;
      gs.forEach(function (g) {
        const th = (g.s + 0.5) * Math.PI / NSEC; let dth = Math.abs(th - (angV < 0 ? angV + Math.PI : angV)); if (dth > Math.PI / 2) dth = Math.PI - dth;
        const tgt = dth < Math.PI / NSEC * 1.01 ? fa : dth > Math.PI / 2 - Math.PI / NSEC * 1.01 ? fc : null; if (!tgt) return;
        for (let li = 0; li < L; li++) tgt[li] += g.w * (1 - (g.d[li] - e.B) / e.A);
        if (tgt === fa) na += g.w; else nc += g.w;
      });
      if (na > 0) { for (let li = 0; li < L; li++) fa[li] /= na; along.push({ q_per_um: S.q_per_um[e.b], f: fa }); }
      if (nc > 0) { for (let li = 0; li < L; li++) fc[li] /= nc; across.push({ q_per_um: S.q_per_um[e.b], f: fc }); }
    });
    // velocity seen in each direction: the frequency along each sector, v cos(theta - theta_v) (Researcher plot)
    const sectorV = [];
    for (let s = 0; s < NSEC; s++) {
      const th = (s + 0.5) * Math.PI / NSEC, ux = Math.cos(th), uy = Math.sin(th);
      // projection fitted on the phase of C over the visible q: phase = -(q . v) dt, with q along the sector
      let num = 0, den = 0;
      for (let li = 0; li < L; li++) {
        const c = C[li], t = taus[li];
        groups.forEach(function (g) {
          if (g.s !== s) return;
          // mean phase over the pixels of the group, against q along the sector direction
          for (let k = 0; k < g.qx.length; k++) {
            const ix = Math.round(g.qx[k] / dkq), iy = Math.round(g.qy[k] / dkq), p = ((iy + n) % n) * n + ((ix + n) % n);
            const re = c[2 * p], im = c[2 * p + 1], amp2 = re * re + im * im;
            const proj = g.qx[k] * ux + g.qy[k] * uy, ph = -Math.atan2(im, re);
            if (Math.abs(proj * speed * t) > 2.5 || amp2 <= 0) continue;          // keep away from phase wrapping
            num += amp2 * proj * t * ph; den += amp2 * proj * t * proj * t;
          }
        });
      }
      sectorV.push({ theta_deg: th * 180 / Math.PI, v_um_s: den > 0 ? num / den : null });
    }
    const eta = movie.viscosity_Pa_s, TK = movie.T_C + 273.15;
    const diameter = D > 0 ? KB * TK / (3 * Math.PI * eta * D * 1e-12) * 1e6 : null;
    const ampOf = new Map(); bins.forEach(function (e) { ampOf.set(e.b, e); });
    return {
      D_um2_s: D, D_rel_err: D_err !== null ? D_err / D : null, diameter_um: diameter,
      v_um_s: speed, v_err_um_s: v_err, v_dir_deg: Math.atan2(vy, vx) * 180 / Math.PI, v_dir_err_deg: dir_err_deg, vx_um_s: vx, vy_um_s: vy,
      v_from_phase: { vx_um_s: v0x, vy_um_s: v0y }, v_jack: { vx_err: vxErr, vy_err: vyErr, n_pixels: ph0.n }, from_structure_function: sf, phase_lags: phaseV, detected: detected, visibility: vis,
      noise_B: noiseB, bins: bins, per_q: perQ, along: along, across: across, sector_v: sectorV,
      taus_s: taus, lags: S.lags, q_per_um: S.q_per_um, binOf: binOf, n: n, L_um: movie.L_um, nb: nb,
      d2d: S.d2d, cross: C, amp: ampOf, window: { q_from: qLo, q_to: qHi, q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um },
      dq: S.dq, varq: S.varq, structure: S
    };
  }

  const api = { analyse: analyse, NSEC: NSEC };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DRIFT = api;
})(typeof self !== "undefined" ? self : this);
