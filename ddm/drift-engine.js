/* DDM of particles that diffuse and drift (flow, sedimentation, thermophoresis): analysis.
 *
 * Model (independent particles, drift v in the image plane):
 *   F(q, t + dt) F*(q, t) averaged over t  =  (A(q) / 2) exp(-D q^2 dt) exp(-i q.v dt)        (no noise at dt > 0)
 *   d(q, dt) = <|F(q, t + dt) - F(q, t)|^2>  =  A(q) [1 - exp(-D q^2 dt) cos(q.v dt)] + B(q)
 * The structure function d keeps only cos(q.v dt): it gives the speed but not the sign of v. The phase of the
 * frame-to-frame cross spectrum C(q, dt) = <F(q, t + dt) F*(q, t)> is -q.v dt (sign included), as used by phase
 * differential microscopy (phiDM: Colin, Zhang and Wilson 2014; with DDM: Richards, Martinez and Arlt 2021).
 *
 * Steps:
 *   1. structure function (shared with the other DDM pages) and C(q, dt) on the same pairs of frames (with a window,
 *      each frame first loses its own mean brightness);
 *   2. first guess of v from the phase difference of neighbouring Fourier pixels, then a fit of the phase of C;
 *   2b. velocity: C turned by the current v, Im z fitted at all pixels and all delays while each pattern is still there
 *      (weights from the noise of each q), iterated; uncertainty: two jackknifes added in quadrature (ten parts of the
 *      movie, eight interleaved groups of q); a drift is reported when the speed exceeds 3 sigma. opts.velocity "phidm" or
 *      opts.published_only: phiDM instead (plane fit of the phase steps between consecutive frames at the widest q);
 *   3-4. D from d(q, dt) in 12 direction sectors with v fixed (A, B per q by linear least squares; B known for cameras;
 *      depth of field as on the sizing page); for comparison D and v fitted together to d alone (opts.velocity
 *      "structure" makes that the headline);
 *   5. fits at each q alone (rate Gamma = D q^2 of the fading, frequency omega = q v of the oscillation along v);
 *   6. where patterns swing (needed by the structure function alone), and the slowest drift this movie shows (3 sigma).
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

  /* Phase differential microscopy (phiDM; Colin, Zhang and Wilson, J. R. Soc. Interface 11, 20140486, 2014): a uniform
   * drift adds to each Fourier mode a phase -q.R(t), with R the displacement of the whole population. Between consecutive
   * frames the phase change of the widest patterns (a square of 2 x 4 + 1 modes per side around q = 0, which keeps the
   * change below pi for drifts up to (pi / 4) / (dq dt)) is fitted with a plane, weighted by the mean power of each mode,
   * giving the step of R; v = sum of steps / time. Uncertainty: jackknife over ten parts of the movie. */
  function phiDM(S, movie, KX, KY, n, P, T) {
    const KC = 4, pix = [];
    for (let iy = -KC; iy <= KC; iy++) for (let ix = -KC; ix <= KC; ix++) { if (ix === 0 && iy === 0) continue; pix.push(((iy + n) % n) * n + ((ix + n) % n)); }
    const fft = S.fft, w = new Float64Array(pix.length);
    for (let t = 0; t < T; t++) { const o = 2 * P * t; pix.forEach(function (p, k) { w[k] += fft[o + 2 * p] * fft[o + 2 * p] + fft[o + 2 * p + 1] * fft[o + 2 * p + 1]; }); }
    const times = movie.times_s || null, dtf = 1 / movie.frame_rate_hz;
    const steps = [];                                                   // { rx, ry, dt, t }
    for (let t = 0; t + 1 < T; t++) {
      const o1 = 2 * P * t, o2 = 2 * P * (t + 1);
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      pix.forEach(function (p, k) {
        const ar = fft[o2 + 2 * p], ai = fft[o2 + 2 * p + 1], br = fft[o1 + 2 * p], bi = fft[o1 + 2 * p + 1];
        const ph = Math.atan2(ai * br - ar * bi, ar * br + ai * bi);    // arg F2 F1*  = -q.dR
        const x1 = -KX[p], x2 = -KY[p];
        a11 += w[k] * x1 * x1; a12 += w[k] * x1 * x2; a22 += w[k] * x2 * x2; b1 += w[k] * x1 * ph; b2 += w[k] * x2 * ph;
      });
      const det = a11 * a22 - a12 * a12; if (!(det > 0)) continue;
      steps.push({ rx: (b1 * a22 - b2 * a12) / det, ry: (a11 * b2 - a12 * b1) / det, dt: times ? times[t + 1] - times[t] : dtf, t: t });
    }
    const velo = function (skip) { let sx = 0, sy = 0, st = 0; steps.forEach(function (e) { if (skip !== undefined && Math.min(9, Math.floor(e.t * 10 / (T - 1))) === skip) return; sx += e.rx; sy += e.ry; st += e.dt; }); return st > 0 ? { vx: sx / st, vy: sy / st } : { vx: 0, vy: 0 }; };
    const v = velo(), jack = []; for (let j = 0; j < 10; j++) jack.push(velo(j));
    return { vx: v.vx, vy: v.vy, n: steps.length * pix.length, jack: jack };
  }

  /* opts.velocity: "phase" (default: v from the phase of the cross spectrum) or "structure" (v and D fitted together to
   * the structure function, as published: no sign of v). opts.published_only: the published method alone (B fitted at
   * each q, v from the structure function). */
  function* analyse(movie, opts) {
    opts = opts || {};
    // the published method alone: velocity by phase differential microscopy (phiDM: Colin, Zhang and Wilson 2014, used with
    // DDM by Richards, Martinez and Arlt 2021), D from the structure function with B fitted at each q and no depth of field
    const published = opts.published_only === true;
    if (published) opts = Object.assign({}, opts, { noise: "fit", depth: false });
    // with a window, each frame first loses its own mean brightness: the bright, unchanging background would otherwise
    // leak through the window into every q and add to C a part that never fades and has no phase, which pinned v at zero
    let mvS = movie;
    if (opts.windowing) {
      const P0 = movie.n * movie.n, fr = new Float32Array(movie.frames.length);
      for (let t = 0; t < movie.T; t++) { const o = t * P0; let m = 0; for (let p = 0; p < P0; p++) m += movie.frames[o + p]; m /= P0; for (let p = 0; p < P0; p++) fr[o + p] = movie.frames[o + p] - m; }
      mvS = Object.assign({}, movie, { frames: fr, fft: null });
    }
    const S = yield* DDM.structure(mvS, opts);
    const n = S.n, P = S.P, T = S.T, L = S.L, fft = S.fft, taus = S.taus_s, nb = S.nb, binOf = S.binOf;
    const dkq = 2 * Math.PI / movie.L_um;                               // q step (1/um)

    // ---- 1. cross spectrum C(q, dt) on the pairs of the structure function ------------------------------------
    // C is also kept apart for K blocks of the movie (a pair counts in the block of its first frame) at about ten
    // lags, so that the phase fit can be repeated with one block left out (jackknife uncertainty of v)
    const K = 10, GQ = 8, blockOf = function (t) { return Math.min(K - 1, Math.floor(t * K / T)); };
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
    const phaseFit = function (getC, vxs, vys, skip) {
      let vx = vxs, vy = vys, used = 0;
      for (let it = 0; it < 6; it++) {
        let a11 = 0, a12 = 0, a22 = 0, r1 = 0, r2 = 0; used = 0;
        for (const li of phaseLags) {
          const c = getC(li); if (!c) continue; const t = taus[li];
          for (let p = 0; p < P; p++) {
            const b = binOf[p]; if (b <= 0 || S.q_per_um[b] < qmin || S.q_per_um[b] > qmax || (skip !== undefined && b % GQ === skip)) continue;
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
    const allC = function (li) { return C[li]; };
    const ph1 = phaseFit(allC, v0x, v0y);                              // start: good for fast drifts (it unwraps the phase)

    // ---- 2b. velocity from the imaginary part of C, at all delays ----------------------------------------------
    // Turn each C by the phase of the current v: z = C e^{+i q.v dt}. Then Im z = -a q.(v_true - v) dt + noise, with a
    // the part of the pattern still there, taken as the mean of Re z over the pixels of the same q (so the weights do
    // not depend on each pixel's own noise, which biased the phase fit with weights |C|^2). Weighted least squares,
    // weights 1 / (noise variance of Im z), estimated for each q and delay from the scatter between its pixels (pooled
    // with the neighbouring q). No phase is ever taken, so a phase of a few hundredths of a radian still counts: this
    // works like tracking, where small mean displacements add up over many particles.
    const pixList = [];
    for (let p = 0; p < P; p++) { const b = binOf[p]; if (b > 0 && S.q_per_um[b] >= qmin && S.q_per_um[b] <= qmax) pixList.push(p); }
    const allLags = []; for (let li = 0; li < L; li++) allLags.push(li);
    const sectorOf = new Int16Array(P);                               // direction sector of each pixel, folded onto [0, pi)
    for (let p = 0; p < P; p++) { let th = Math.atan2(KY[p], KX[p]); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI; sectorOf[p] = Math.min(NSEC - 1, Math.floor(th / Math.PI * NSEC)); }
    // skip: a group of q left out (jackknife); along: { ux, uy, sector } fits only the speed along that unit vector, with
    // the pixels of that sector of directions (the drift seen by patterns of each direction)
    const imFit = function (getC, lags, vxs, vys, skip, along) {
      let lastInfo = 0;
      let vx = vxs, vy = vys, used = 0;
      const sRe = new Float64Array(nb + 1), sIm2 = new Float64Array(nb + 1), sRe2 = new Float64Array(nb + 1), cnt = new Float64Array(nb + 1);
      const xx = new Float64Array(nb + 1), xy = new Float64Array(nb + 1), yy = new Float64Array(nb + 1), x1y = new Float64Array(nb + 1), x2y = new Float64Array(nb + 1), x11 = new Float64Array(nb + 1), x12 = new Float64Array(nb + 1), x22 = new Float64Array(nb + 1);
      const alive = new Uint8Array(nb + 1);
      for (let it = 0; it < 5; it++) {
        let a11 = 0, a12 = 0, a22 = 0, r1 = 0, r2 = 0; used = 0;
        alive.fill(1);
        for (const li of lags) {                                       // delays in increasing order
          const c = getC(li); if (!c) continue; const t = taus[li];
          sRe.fill(0); sRe2.fill(0); cnt.fill(0); x11.fill(0); x12.fill(0); x22.fill(0); x1y.fill(0); x2y.fill(0); yy.fill(0);
          for (const p of pixList) {
            const b = binOf[p]; if (skip !== undefined && b % GQ === skip) continue;
            if (along && (sectorOf[p] >> 1) !== along.sector) continue;
            const ph = (KX[p] * vx + KY[p] * vy) * t, cs = Math.cos(ph), sn = Math.sin(ph);
            const zr = c[2 * p] * cs - c[2 * p + 1] * sn, zi = c[2 * p] * sn + c[2 * p + 1] * cs;
            sRe[b] += zr; sRe2[b] += zr * zr; cnt[b]++;
            const u1 = along ? -(KX[p] * along.ux + KY[p] * along.uy) * t : -KX[p] * t, u2 = along ? 0 : -KY[p] * t;   // x = a u
            x11[b] += u1 * u1; x12[b] += u1 * u2; x22[b] += u2 * u2; x1y[b] += u1 * zi; x2y[b] += u2 * zi; yy[b] += zi * zi;
          }
          // noise variance of Im z in each bin: what is left after the bin's own best shift, pooled with its neighbours
          const resid = new Float64Array(nb + 1), dof = new Float64Array(nb + 1), aB = new Float64Array(nb + 1);
          for (let b = 1; b <= nb; b++) {
            if (cnt[b] < 2 || !alive[b]) continue;
            const a = sRe[b] / cnt[b], aErr = Math.sqrt(Math.max(0, sRe2[b] / cnt[b] - a * a) / (cnt[b] / 2));   // conjugate pairs: half as many values
            // only while the pattern is still clearly there (a tenth of A/2 or more, and well above its own noise), from
            // the shortest delay on: once it has faded, a later mean of pure noise that happens to come out positive
            // would otherwise count, and at long delays it weighs most and pins v where it is
            if (!(a > 3 * aErr) || !(a > 0.1 * ampRef[b])) { alive[b] = 0; continue; }
            aB[b] = a;
            const det = x11[b] * x22[b] - x12[b] * x12[b];
            let r = yy[b];
            if (along) { if (x11[b] > 0) r -= x1y[b] * x1y[b] / x11[b]; }
            else if (det > 0) { const d1 = (x1y[b] * x22[b] - x2y[b] * x12[b]) / det, d2 = (x11[b] * x2y[b] - x12[b] * x1y[b]) / det; r -= d1 * x1y[b] + d2 * x2y[b]; }
            resid[b] = Math.max(0, r); dof[b] = Math.max(1, cnt[b] / 2 - (along ? 1 : 2));   // pixels come in conjugate pairs
          }
          for (let b = 1; b <= nb; b++) {
            if (!aB[b]) continue;
            let rs = 0, ds = 0; for (let k = Math.max(1, b - 1); k <= Math.min(nb, b + 1); k++) { rs += resid[k] / 2; ds += dof[k]; }
            const v2 = rs / ds; if (!(v2 > 0)) continue;
            const w = aB[b] * aB[b] / v2, wy = aB[b] / v2;
            a11 += w * x11[b]; a12 += w * x12[b]; a22 += w * x22[b]; r1 += wy * x1y[b]; r2 += wy * x2y[b]; used += cnt[b];
          }
        }
        let dx, dy;
        // along one direction: a single linear step from the drift found (iterating on one sector's data can run away)
        if (along) { if (!(a11 > 0)) break; lastInfo = a11; const d = r1 / a11; vx += d * along.ux; vy += d * along.uy; break; }
        else { const det = a11 * a22 - a12 * a12; if (!(det > 0)) break; dx = (r1 * a22 - r2 * a12) / det; dy = (a11 * r2 - a12 * r1) / det; }
        vx += dx; vy += dy;
        if (Math.hypot(dx, dy) < 1e-4 * Math.max(Math.hypot(vx, vy), 1e-3)) break;
      }
      return { vx: vx, vy: vy, n: used, info: along ? lastInfo : null };
    };
    // two starts, the phase fit and no drift at all; keep the one whose turned C has the least imaginary part left
    const imLeft = function (vx, vy) {
      let s = 0;
      for (const li of allLags) { const c = C[li], t = taus[li]; let im2 = 0, all = 0;
        for (const p of pixList) { const ph = (KX[p] * vx + KY[p] * vy) * t, zi = c[2 * p] * Math.sin(ph) + c[2 * p + 1] * Math.cos(ph); im2 += zi * zi; all += c[2 * p] * c[2 * p] + c[2 * p + 1] * c[2 * p + 1]; }
        if (all > 0) s += im2 / all; }
      return s;
    };
    const fa = imFit(allC, allLags, ph1.vx, ph1.vy), fb = imFit(allC, allLags, 0, 0);
    const ph0 = imLeft(fa.vx, fa.vy) <= imLeft(fb.vx, fb.vy) ? fa : fb;
    // uncertainty: jackknifes over ten parts of the movie (at the delays kept per part) and over eight interleaved groups
    // of q. The parts of one movie share the arrangement of the particles in the widest patterns, so the first can come
    // out too small; each is itself noisy (few parts). Both are added in quadrature: against the scatter between new
    // movies this was right for 200 nm beads (slow and fast drifts) and still a factor 1.4 small for 1 um beads at 10 um/s.
    const jackErr = function (rs) {
      const k = rs.length, mx = rs.reduce(function (a, r) { return a + r.vx; }, 0) / k, my = rs.reduce(function (a, r) { return a + r.vy; }, 0) / k;
      return [Math.sqrt((k - 1) / k * rs.reduce(function (a, r) { return a + (r.vx - mx) * (r.vx - mx); }, 0)), Math.sqrt((k - 1) / k * rs.reduce(function (a, r) { return a + (r.vy - my) * (r.vy - my); }, 0))];
    };
    // speed and direction errors from the same replicates (each replicate's own speed and angle)
    const jackPolar = function (rs) {
      const k = rs.length, sp = rs.map(function (r) { return Math.hypot(r.vx, r.vy); }), a0 = Math.atan2(ph0.vy, ph0.vx);
      const an = rs.map(function (r) { let d = Math.atan2(r.vy, r.vx) - a0; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return d; });
      const sd = function (x) { const m = x.reduce(function (a, c) { return a + c; }, 0) / k; return Math.sqrt((k - 1) / k * x.reduce(function (a, c) { return a + (c - m) * (c - m); }, 0)); };
      return [sd(sp), sd(an)];
    };
    let jt = [], jq = [];
    let phT = imFit(allC, phaseLags, ph0.vx, ph0.vy);
    for (let j = 0; j < K; j++) jt.push(imFit(function (li) { return cWithout(li, j); }, phaseLags, phT.vx, phT.vy));
    for (let j = 0; j < GQ; j++) jq.push(imFit(allC, allLags, ph0.vx, ph0.vy, j));
    // the published method: phiDM for the velocity (it replaces the fit above; its own jackknife over parts of the movie)
    if (published || opts.velocity === "phidm") {
      const pd = phiDM(S, movie, KX, KY, n, P, T);
      ph0.vx = pd.vx; ph0.vy = pd.vy; ph0.n = pd.n; jt = pd.jack; jq = pd.jack; phT = { vx: pd.vx, vy: pd.vy };
    }
    // The two jackknifes, over parts of the movie and over groups of q (larger when few particles fill the field), added
    // in quadrature. Against the scatter between new movies this is on the safe side by up to 1.45 times (200 nm beads,
    // 2 um/s); the larger of the two alone was up to 1.35 times too small (3 um/s at 120 deg), and so were directions.
    const eT = jackErr(jt), eQ = jackErr(jq), pT = jackPolar(jt), pQ = jackPolar(jq);
    const vxErr = Math.hypot(eT[0], eQ[0]), vyErr = Math.hypot(eT[1], eQ[1]);
    const speedErr = Math.hypot(pT[0], pQ[0]), angErr = Math.hypot(pT[1], pQ[1]);
    // nothing usable (no q kept): no error, no detection
    const fitEmpty = !(ph0.n > 0) || !(vxErr > 0 || vyErr > 0);

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
    // depth of field, as on the sizing page: particles that diffuse up or down also fade from each pattern, through the
    // optics of the movie (DDM depthC). Tabulated per q against the variance 2 D dt of the axial step. Without it D read
    // about 3 % high for 200 nm beads at 20x. Off for the published method.
    const info = movie.info, useDepth = opts.depth !== false && info && info.kernel && info.kernel_q && info.cell_z_um && !info.split && DDM._test && DDM._test.depthC;
    const NX = 64, X0 = Math.log(1e-4), X1 = Math.log(1e4), fadeTab = new Map();
    const fadeOf = function (q, D, t) {
      if (!useDepth) return 1;
      let tab = fadeTab.get(q);
      if (tab === undefined) {
        const tb = DDM._test.depthC(info, q);
        tab = tb ? new Float64Array(NX + 1) : null;
        if (tab) for (let i = 0; i <= NX; i++) tab[i] = DDM._test.depthFade(tb, Math.exp(X0 + (X1 - X0) * i / NX) / 2, 1);
        fadeTab.set(q, tab);
      }
      if (!tab) return 1;
      const x = Math.log(Math.max(2 * D * t, 1e-12)), u = (x - X0) / (X1 - X0) * NX;
      if (u <= 0) return tab[0]; if (u >= NX) return tab[NX];
      const i = Math.floor(u), f = u - i; return tab[i] + f * (tab[i + 1] - tab[i]);
    };
    const decayOf = function (g, D, vx, vy, out) {
      const m = g.qx.length;
      for (let li = 0; li < L; li++) {
        const t = taus[li]; let cs = 0;
        for (let k = 0; k < m; k++) cs += Math.cos((g.qx[k] * vx + g.qy[k] * vy) * t);
        out[li] = Math.exp(-D * g.q * g.q * t) * fadeOf(g.q, D, t) * cs / m;
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
    let D = Math.exp(fD.x[0]), vx = ph0.vx, vy = ph0.vy;
    // for comparison: D and v from the structure function alone (it has cos(q.v dt) only: no sign, and it can trade
    // drift against diffusion when the pattern fades before it oscillates)
    const vScale = Math.max(Math.hypot(vx, vy), D * qm, 1e-3);
    const fitSF = nelderMead(function (x) { return totalCost(Math.exp(x[0]), x[1], x[2], binsUsed); },
      [Math.log(D), vx, vy], [0.2, 0.2 * vScale, 0.2 * vScale], 400);
    const sf = { D_um2_s: Math.exp(fitSF.x[0]), v_um_s: Math.hypot(fitSF.x[1], fitSF.x[2]), v_dir_deg: Math.atan2(fitSF.x[2], fitSF.x[1]) * 180 / Math.PI };
    const fromSF = opts.velocity === "structure";
    if (fromSF) { D = sf.D_um2_s; vx = fitSF.x[1]; vy = fitSF.x[2]; if (vx < 0 || (vx === 0 && vy < 0)) { vx = -vx; vy = -vy; } }   // no sign: shown along +x
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
    // uncertainty of v from the jackknifes, along v (speed) and across it (direction)
    const v_err = fitEmpty ? null : speedErr;
    const dir_err_deg = fitEmpty || !(speed > 0) ? null : angErr * 180 / Math.PI;

    // ---- 6. can the drift be seen? ------------------------------------------------------------------------------
    // With the cross spectrum: when the speed is well above its uncertainty (3 sigma, sigma per component), as with
    // tracking; no pattern has to swing. "swing": where the structure function alone can see it, because the pattern
    // at q oscillates (q v dt about 1) before diffusion erases it (D q^2 dt about 2), q < 2 v / D, and within the movie,
    // q v (longest delay) > 1. Widest and finest q used bound what is available.
    const qLo = S.q_per_um[binsUsed[0]], qHi = S.q_per_um[binsUsed[binsUsed.length - 1]];
    const sigmaV = Math.sqrt((vxErr * vxErr + vyErr * vyErr) / 2);
    const visibility = function (v, Dv) {
      const a = Math.max(qLo, 1 / (v * taus[L - 1])), z = Math.min(qHi, 2 * v / Dv);
      const nq = binsUsed.filter(function (b) { const q = S.q_per_um[b]; return q >= a && q <= z; }).length;
      return { q_from: a, q_to: z, n_q: nq, swing: nq >= 3, visible: nq >= 3, q_star: v / Dv, peclet: v * movie.L_um / Dv, v_min_um_s: 3 * sigmaV };
    };
    const vis = visibility(Math.max(speed, 1e-9), D);
    let detected = !fitEmpty && speed > 3 * Math.max(sigmaV, 1e-12);
    let vErrOut = v_err;
    // the structure function alone: its speed's uncertainty from the scatter of q v (omega / q) between the q whose
    // patterns swing within the movie; it sees a drift only where patterns swing, and then above 3 times that
    const sfErr = function (v) { return spreadOf(okQ.filter(function (e) { return e.q_per_um * v * taus[L - 1] > 1; }).map(function (e) { return e.omega_rad_s / e.q_per_um; })); };
    sf.v_err_um_s = sfErr(sf.v_um_s);
    sf.detected = visibility(Math.max(sf.v_um_s, 1e-9), sf.D_um2_s).swing && sf.v_err_um_s !== null && sf.v_um_s > 3 * sf.v_err_um_s;
    if (fromSF) { vErrOut = sfErr(speed); detected = vis.swing && vErrOut !== null && speed > 3 * vErrOut; }
    vis.visible = detected;

    // ---- outputs for the page ------------------------------------------------------------------------------------
    // sector curves along and across the drift (normalised: f = 1 - (d - B) / A), per bin
    const along = [], across = [];
    // along and across the drift when one is detected; otherwise no in-plane direction is special, and the two sets are
    // simply the patterns along x and along y of the image (the noise in v would give a random direction)
    const angV = detected ? Math.atan2(vy, vx) : 0;
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
    // speed seen by the patterns of each direction (twelve sectors of 15 degrees): one linear step of the same fit as the
    // velocity, from the drift found, with only the pixels of one sector and only the speed along it. The part of each
    // pattern still there (a) and the noise of Im z come from all pixels of the same q (a sector alone has too few, and
    // its fits ran away), and each q is used until it first fades. Uncertainty: jackknife over interleaved groups of q.
    // The first version averaged the phase itself over all delays, where delays of pure noise pulled it towards zero.
    const NS = NSEC, secNum = [], secDen = [];
    for (let s = 0; s < NS; s++) { secNum.push(new Float64Array(GQ + 1)); secDen.push(new Float64Array(GQ + 1)); }
    {
      const alive = new Uint8Array(nb + 1).fill(1), sRe = new Float64Array(nb + 1), sRe2 = new Float64Array(nb + 1), cnt = new Float64Array(nb + 1), yy = new Float64Array(nb + 1);
      for (const li of allLags) {
        const c = C[li], t = taus[li];
        sRe.fill(0); sRe2.fill(0); cnt.fill(0); yy.fill(0);
        const zr = new Float64Array(pixList.length), zi = new Float64Array(pixList.length);
        pixList.forEach(function (p, k) {
          const b = binOf[p], ph = (KX[p] * ph0.vx + KY[p] * ph0.vy) * t, cs = Math.cos(ph), sn = Math.sin(ph);
          zr[k] = c[2 * p] * cs - c[2 * p + 1] * sn; zi[k] = c[2 * p] * sn + c[2 * p + 1] * cs;
          sRe[b] += zr[k]; sRe2[b] += zr[k] * zr[k]; cnt[b]++; yy[b] += zi[k] * zi[k];
        });
        const aB = new Float64Array(nb + 1), v2B = new Float64Array(nb + 1);
        for (let b = 1; b <= nb; b++) {
          if (cnt[b] < 2 || !alive[b]) continue;
          const a = sRe[b] / cnt[b], aErr = Math.sqrt(Math.max(0, sRe2[b] / cnt[b] - a * a) / (cnt[b] / 2));
          if (!(a > 3 * aErr) || !(a > 0.1 * ampRef[b])) { alive[b] = 0; continue; }
          aB[b] = a; v2B[b] = yy[b] / cnt[b];                       // the global drift is removed, so Im z is mostly noise
        }
        pixList.forEach(function (p, k) {
          const b = binOf[p]; if (!aB[b] || !(v2B[b] > 0)) return;
          const s = sectorOf[p], th = (s + 0.5) * Math.PI / NS, u = -(KX[p] * Math.cos(th) + KY[p] * Math.sin(th)) * t;
          const w = aB[b] / v2B[b], g = b % GQ;
          secNum[s][GQ] += w * u * zi[k]; secDen[s][GQ] += w * aB[b] * u * u;
          secNum[s][g] += w * u * zi[k]; secDen[s][g] += w * aB[b] * u * u;
        });
      }
    }
    const sectorV = [];
    for (let s = 0; s < NS; s++) {
      const th = (s + 0.5) * Math.PI / NS, base = ph0.vx * Math.cos(th) + ph0.vy * Math.sin(th);
      const N = secNum[s][GQ], Dn = secDen[s][GQ];
      if (!(Dn > 0)) { sectorV.push({ theta_deg: th * 180 / Math.PI, v_um_s: null, err_um_s: null }); continue; }
      const jj = []; for (let j = 0; j < GQ; j++) { const dn = Dn - secDen[s][j]; if (dn > 0) jj.push((N - secNum[s][j]) / dn); }
      let err = null;
      if (jj.length > 2) { const m = jj.reduce(function (a, c) { return a + c; }, 0) / jj.length; err = Math.sqrt((jj.length - 1) / jj.length * jj.reduce(function (a, c) { return a + (c - m) * (c - m); }, 0)); }
      // the q jackknife alone can be too small (slow or sparse samples): scaled up by the ratio of the time jackknife to it
      // for the whole velocity, when larger
      const scale = Math.max(1, Math.hypot(eT[0], eT[1]) / Math.max(Math.hypot(eQ[0], eQ[1]), 1e-12));
      sectorV.push({ theta_deg: th * 180 / Math.PI, v_um_s: base + N / Dn, err_um_s: err === null ? null : err * scale });
    }
    const eta = movie.viscosity_Pa_s, TK = movie.T_C + 273.15;
    const diameter = D > 0 ? KB * TK / (3 * Math.PI * eta * D * 1e-12) * 1e6 : null;
    const ampOf = new Map(); bins.forEach(function (e) { ampOf.set(e.b, e); });
    return {
      D_um2_s: D, D_rel_err: D_err !== null ? D_err / D : null, diameter_um: diameter,
      v_um_s: speed, v_err_um_s: vErrOut, v_dir_deg: Math.atan2(vy, vx) * 180 / Math.PI, v_dir_err_deg: fromSF ? null : dir_err_deg, vx_um_s: vx, vy_um_s: vy,
      v_from_phase: { vx_um_s: v0x, vy_um_s: v0y }, v_jack: { vx_err: vxErr, vy_err: vyErr, time: eT, q: eQ, n_pixels: ph0.n }, from_structure_function: sf, phase_lags: phaseV, detected: detected, visibility: vis,
      noise_B: noiseB, velocity_from: fromSF ? "structure" : (published || opts.velocity === "phidm") ? "phidm" : "phase", bins: bins, times_s: S.times_s, pairs: S.pairs, per_q: perQ, along: along, across: across, published: published, curves_axes: detected ? "drift" : "image", sector_v: fromSF ? [] : sectorV,
      taus_s: taus, lags: S.lags, q_per_um: S.q_per_um, binOf: binOf, n: n, L_um: movie.L_um, nb: nb,
      d2d: S.d2d, cross: C, amp: ampOf, window: { q_from: qLo, q_to: qHi, q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um, q_opt_per_um: S.q_opt_per_um, q_nyq_per_um: S.q_nyq_per_um, gamma_lo_hz: S.gamma_lo_hz, gamma_hi_hz: S.gamma_hi_hz },
      dq: S.dq, varq: S.varq, windowing: !!S.window
    };
  }

  // what the result table shows for the published method alone, run on the same movie
  function publishedSummary(r) { return { v_um_s: r.v_um_s, v_err_um_s: r.v_err_um_s, v_dir_deg: r.v_dir_deg, D_um2_s: r.D_um2_s, detected: r.detected }; }
  const api = { analyse: analyse, publishedSummary: publishedSummary, NSEC: NSEC };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DRIFT = api;
})(typeof self !== "undefined" ? self : this);
