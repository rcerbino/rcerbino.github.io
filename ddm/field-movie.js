/*
 * A bright-field movie of proteins in solution, simulated as a density field rather than as single molecules.
 *
 * Proteins are a few nanometres across, far below what the microscope resolves, and there are billions of them in the
 * field of view. The camera sees their number density rho(r, t), each protein adding its own faint image K(q, z) (the
 * same optical kernel as for a particle on the other pages, here for a sphere of the protein's volume and index). In a
 * periodic box L x L x Lz, with rho(q, kz) = sum over proteins of exp(-i (q.x + kz z)):
 *
 *   image spectrum   F(q) = (pixel factor / a^2) (1 / Lz) sum_kz Ktilde(q, kz) rho(q, kz),  Ktilde = int K(q, z) e^{i kz z} dz
 *   statistics       <|rho(q, kz)|^2> = N S(0),  <rho(t) rho*(0)> / <|rho|^2> = exp(-D_c (q^2 + kz^2) t)
 *
 * N the number of proteins in the box, S(0) their structure factor and D_c their collective diffusion coefficient, both
 * at wave vectors far below 1 / R (q R ~ 0.01 here). Each (q, kz) is an independent complex Ornstein-Uhlenbeck process.
 * Over the exposure the camera averages it: the pair (value at the end, integral over the exposure) is drawn exactly
 * from its joint Gaussian. Pixels: background bgE (1 + signal), shot noise and read noise as in movie.js; a global
 * shutter, evenly spaced frames, no aliasing (the bright-field cut-off lies below the camera's Nyquist frequency at the
 * magnifications used; patterns beyond it are left out).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"));
  else root.FIELD = factory(root.OPTICS);
})(typeof self !== "undefined" ? self : this, function (O) {
  "use strict";
  const TWO_PI = 2 * Math.PI;
  function fail(msg) { throw new Error("Field movie: " + msg); }
  function need(c, msg) { if (!c) fail(msg); }
  function num(o, k, lo, hi) { const v = o[k]; need(typeof v === "number" && Number.isFinite(v), "missing setting '" + k + "'"); need(v >= lo && v <= hi, "setting '" + k + "' = " + v + " outside [" + lo + ", " + hi + "]"); return v; }
  function makeRng(seed) {
    let a = seed >>> 0, spare = null;
    const u = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const g = function () { if (spare !== null) { const s = spare; spare = null; return s; } let x = 0; while (x === 0) x = u(); const y = u(), r = Math.sqrt(-2 * Math.log(x)); spare = r * Math.sin(TWO_PI * y); return r * Math.cos(TWO_PI * y); };
    return { u: u, g: g };
  }
  // fast normal deviates: a fixed table of 2^18 values picked by a xorshift index (the modes need hundreds of millions)
  function fastNormal(seed) {
    const tab = NORMAL_TABLE(seed ^ 0x2545f491), n = tab.length;
    let s = (seed * 2654435761) >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return tab[s & (n - 1)]; };
  }

  // the table is shifted and scaled to mean 0 and variance 1 exactly: the camera noise B is then known to the analysis
  // to better than a part in a million, which matters when the proteins add less than a percent to it
  function NORMAL_TABLE(seed) {
    const r = makeRng(seed ^ 0x51ed27), n = 1 << 18, v = new Float64Array(n); let m = 0, s2 = 0;
    for (let i = 0; i < n; i++) { v[i] = r.g(); m += v[i]; } m /= n;
    for (let i = 0; i < n; i++) s2 += (v[i] - m) * (v[i] - m); const sc = 1 / Math.sqrt(s2 / n);
    const tab = new Float32Array(n); for (let i = 0; i < n; i++) tab[i] = (v[i] - m) * sc; return tab;
  }
  const kernelMemo = new Map();
  function memoKernel(args) {
    const key = JSON.stringify(args, function (k, v) { return ArrayBuffer.isView(v) ? Array.from(v) : v; });
    if (kernelMemo.has(key)) return kernelMemo.get(key);
    const r = O.transmittedKernel(args);
    if (kernelMemo.size >= 6) kernelMemo.delete(kernelMemo.keys().next().value);
    kernelMemo.set(key, r); return r;
  }

  /* cfg: seed, mode "brightfield", objective {mag, na}, illum {na_in, na_out}, source, liquid, detector (camera),
   *      n_px, n_frames, frame_rate_hz, exposure_s, T_C, cell_um, focus_um, light_frac,
   *      protein: { diameter_um (volume diameter, for the optics), n (refractive index), number_density_um3, S0, Dc_um2_s } */
  function* simulate(cfg) {
    need(cfg.mode === "brightfield", "proteins are simulated in bright field only");
    num(cfg, "seed", 0, 4294967295);
    const mag = num(cfg.objective, "mag", 1, 150), na = num(cfg.objective, "na", 0.02, 1.5);
    const det = cfg.detector; need(det && det.kind === "camera", "a camera is needed");
    const b = num(det, "binning", 1, 4); need(b === 1 || b === 2 || b === 4, "binning must be 1, 2 or 4");
    const N = num(cfg, "n_px", 32, 256); need((N & (N - 1)) === 0, "simulated image size must be a power of two");
    const T = num(cfg, "n_frames", 16, 4096);
    need(N * N * T <= (1 << 23), "movie too large for the browser (pixels x frames above 8.4 million)");
    const fr = num(cfg, "frame_rate_hz", 0.01, 30000), expo = num(cfg, "exposure_s", 0, 10);
    need(expo <= 1 / fr * 1.0000001, "exposure longer than the frame interval");
    const T_C = num(cfg, "T_C", 0, 90), Lz = num(cfg, "cell_um", 1, 400), hf = num(cfg, "focus_um", 0, 400);
    const pr = cfg.protein; need(pr, "protein missing");
    const dP = num(pr, "diameter_um", 1e-4, 0.1), nP = num(pr, "n", 1, 2), rho = num(pr, "number_density_um3", 1, 1e8);
    const S0 = num(pr, "S0", 0.01, 100), Dc = num(pr, "Dc_um2_s", 0.01, 1e4);
    const a = num(det, "pixel_um", 0.5, 30) * b / mag, L = N * a;
    const zlo = hf - Lz, zhi = hf;

    // kernel of one protein over the depth of the cell
    const spec = O.SOURCES[cfg.source].sample(), lmin = Math.min.apply(null, spec.map(function (s) { return s.l; }));
    const lamRef = spec.reduce(function (p, s) { return p + s.w * s.l; }, 0);
    need(cfg.illum && cfg.illum.na_out > 0, "illumination aperture missing");
    const qcut = TWO_PI / lmin * (Math.min(na, 1.34) + Math.min(cfg.illum.na_out, 1.34));
    const qNyq = Math.PI / a, qKmax = Math.min(qcut * 1.02, qNyq * Math.SQRT2 * 1.01), nq = 200;
    const qk = new Float64Array(nq); for (let i = 0; i < nq; i++) qk[i] = i * qKmax / (nq - 2);
    yield { stage: "Computing how one protein looks", frac: 0.01 };
    const Tk = memoKernel({ diameter_um: dP, particle: { n: nP }, liquid: cfg.liquid, na_obj: na, illum: cfg.illum, pupil: { kind: "none" }, source: cfg.source, q_per_um: qk, z_lo: zlo - 0.5, z_hi: zhi + 0.5, homodyne: false, homodyne_only: false, aberration: null, scalar: true });
    need(!Tk.dark, "bright field only");
    const zk = Tk.z_um, nz = zk.length, dzk = zk[1] - zk[0];

    // camera grid: each wave vector of one half plane, its partner -q is the complex conjugate
    const P = N * N, Nbox = rho * L * L * Lz;
    // as fine in depth as the kernel is tabulated
    const Mz = Math.min(400, Math.floor(Lz / dzk));
    // cosine modes between the walls (reflecting, as the particles of movie.js): Khat_n(q) = int K(q, z) cos(n pi (z - zlo) / Lz) dz
    // by the trapezoid rule over the cell, on the kernel's wave vectors; weights 1 for n = 0 and sqrt 2 for n > 0, so that
    // (1 / Lz) Khat_n times a unit-variance mode of rms sqrt(N S0) gives the image of the proteins (Parseval for cosines)
    const CT = new Float64Array((Mz + 1) * nz);
    for (let m = 0; m <= Mz; m++) for (let j = 0; j < nz; j++) {
      const z = zk[j]; if (z < zlo - 1e-9 || z > zhi + 1e-9) continue;
      const w = (Math.abs(z - zlo) < dzk / 2 || Math.abs(z - zhi) < dzk / 2) ? 0.5 * dzk : dzk;
      CT[m * nz + j] = (m === 0 ? 1 : Math.SQRT2) * w * Math.cos(m * Math.PI / Lz * (z - zlo));
    }
    const KHr = new Float64Array(nq * (Mz + 1)), KHi = new Float64Array(nq * (Mz + 1));
    for (let iq = 0; iq < nq; iq++) for (let m = 0; m <= Mz; m++) {
      let sr = 0, si = 0; const ko = iq * nz, co = m * nz;
      for (let j = 0; j < nz; j++) { const c = CT[co + j]; if (c !== 0) { sr += c * Tk.Kr[ko + j]; si += c * Tk.Ki[ko + j]; } }
      KHr[iq * (Mz + 1) + m] = sr; KHi[iq * (Mz + 1) + m] = si;
    }
    const modes = { p: [], wr: [], wi: [], a1: [], l11: [], l21: [], l22: [], bb: [], gd: [], gs: [] };
    const amp = new Float64Array(N / 2 + 1), cnt = new Float64Array(N / 2 + 1);   // expected A(q) per ring, for the truth
    const bgE = num(cfg, "light_frac", 0.0005, 1) * (det.full_well_e * b * b);
    const gap = 1 / fr - expo;
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
      const ky = iy < N / 2 ? iy : iy - N, kx = ix < N / 2 ? ix : ix - N;
      if (ky < 0 || (ky === 0 && kx <= 0) || Math.abs(kx) === N / 2 || Math.abs(ky) === N / 2) continue;
      const qx = kx * TWO_PI / L, qy = ky * TWO_PI / L, q = Math.hypot(qx, qy);
      if (q >= qKmax * 0.999 || q >= qcut) continue;
      const ux = qx * a / 2, uy = qy * a / 2, pix = (Math.abs(ux) < 1e-12 ? 1 : Math.sin(ux) / ux) * (Math.abs(uy) < 1e-12 ? 1 : Math.sin(uy) / uy);
      const t = q / qKmax * (nq - 2), i0 = Math.floor(t), f = t - i0;
      // cosine modes of this q, interpolated between the kernel's wave vectors
      const kt = []; let kmax2 = 0;
      for (let m = 0; m <= Mz; m++) {
        const o0 = i0 * (Mz + 1) + m, o1 = o0 + Mz + 1, sr = KHr[o0] + f * (KHr[o1] - KHr[o0]), si = KHi[o0] + f * (KHi[o1] - KHi[o0]);
        kt.push([m * Math.PI / Lz, sr, si]); kmax2 = Math.max(kmax2, sr * sr + si * si);
      }
      const scale = bgE * pix / (a * a) / Lz * Math.sqrt(Nbox * S0);   // electrons, for a unit-variance mode
      let a2 = 0;
      for (const e of kt) {
        const k2 = e[1] * e[1] + e[2] * e[2]; if (k2 < 1e-3 * kmax2) continue;
        const g = Dc * (q * q + e[0] * e[0]), x = g * expo;
        modes.p.push(iy * N + ix); modes.wr.push(scale * e[1]); modes.wi.push(scale * e[2]);
        a2 += scale * scale * k2;
        // exposure-averaged value: Y = [x0 (1 - e^-x) / g + eta2] / Te, end value x0 e^-x + eta1 (per real component, variance 1/2)
        if (expo > 0) {
          const ex = Math.exp(-x), v1 = 0.5 * (1 - ex * ex), v2 = 0.5 * (2 * x - 3 + 4 * ex - ex * ex) / (x * x), c12 = 0.5 * (1 - ex) * (1 - ex) / x;
          // eta2 scaled by 1 / Te; small x: series to avoid cancellation
          const V2 = x < 1e-3 ? 0.5 * (2 * x / 3 - x * x / 2) : v2, C12 = x < 1e-3 ? 0.5 * (x - x * x) : c12;
          const l11 = Math.sqrt(Math.max(v1, 0)), l21 = l11 > 0 ? C12 / l11 : 0, l22 = Math.sqrt(Math.max(V2 - l21 * l21, 0));
          modes.a1.push(ex); modes.l11.push(l11); modes.l21.push(l21); modes.l22.push(l22); modes.bb.push(x < 1e-6 ? 1 : (1 - ex) / x);
        } else { modes.a1.push(1); modes.l11.push(0); modes.l21.push(0); modes.l22.push(0); modes.bb.push(1); }
        const eg = Math.exp(-g * gap); modes.gd.push(eg); modes.gs.push(Math.sqrt(0.5 * (1 - eg * eg)));
      }
      // expected amplitude of this pattern in the analysis' units: A = 2 <|F|^2> / P (both halves of the plane alike)
      const ring = Math.round(Math.hypot(kx, ky)); if (ring <= N / 2 && kx !== 0 && ky !== 0) { amp[ring] += 2 * a2 / P; cnt[ring]++; }
    }
    const M = modes.p.length;
    const MP = Int32Array.from(modes.p), WR = Float64Array.from(modes.wr), WI = Float64Array.from(modes.wi), A1 = Float64Array.from(modes.a1);
    const L11 = Float64Array.from(modes.l11), L21 = Float64Array.from(modes.l21), L22 = Float64Array.from(modes.l22), BB = Float64Array.from(modes.bb);
    const GD = Float64Array.from(modes.gd), GS = Float64Array.from(modes.gs);
    const conj = new Int32Array(P); for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) conj[iy * N + ix] = ((N - iy) % N) * N + (N - ix) % N;

    // the modes start from their stationary distribution
    const rng = makeRng(cfg.seed), gn = fastNormal(cfg.seed);
    const TAB = NORMAL_TABLE(cfg.seed), MASK = TAB.length - 1, GS0 = { s: ((cfg.seed * 2654435761) | 0) || 1 };
    const withGap = gap > 1e-2 * Math.max(expo, 1e-12);   // a gap shorter than a hundredth of the exposure is left out
    const XR = new Float64Array(M), XI = new Float64Array(M), SQ = Math.SQRT1_2;
    for (let m = 0; m < M; m++) { XR[m] = SQ * rng.g(); XI[m] = SQ * rng.g(); }
    const readE = det.read_noise_e * b, fullWell = det.full_well_e * b * b;
    const tb = O.FFT.tables(N), wk = O.FFT.work(N);
    const Fr = new Float64Array(P), Fi = new Float64Array(P), re = new Float64Array(P), im = new Float64Array(P);
    const frames = new Float32Array(P * T), fft = new Float32Array(2 * P * T);
    yield { stage: "Recording the movie", frac: 0.05 };
    for (let t = 0; t < T; t++) {
      Fr.fill(0); Fi.fill(0);
      // normal deviates inlined (xorshift index into the table): this loop runs hundreds of millions of times
      let s = GS0.s;
      for (let m = 0; m < M; m++) {
        const xr = XR[m], xi = XI[m];
        let yr, yi;
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g1 = TAB[s & MASK];
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g2 = TAB[s & MASK];
        if (expo > 0) {
          s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g3 = TAB[s & MASK];
          s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g4 = TAB[s & MASK];
          const bb = BB[m], l21 = L21[m], l22 = L22[m], l11 = L11[m], a1 = A1[m];
          yr = xr * bb + l21 * g1 + l22 * g2; yi = xi * bb + l21 * g3 + l22 * g4;
          let er = a1 * xr + l11 * g1, ei = a1 * xi + l11 * g3;
          if (withGap) {
            s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g5 = TAB[s & MASK];
            s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const g6 = TAB[s & MASK];
            er = GD[m] * er + GS[m] * g5; ei = GD[m] * ei + GS[m] * g6;
          }
          XR[m] = er; XI[m] = ei;
        } else {
          yr = xr; yi = xi;
          XR[m] = GD[m] * xr + GS[m] * g1; XI[m] = GD[m] * xi + GS[m] * g2;
        }
        const p = MP[m], w1 = WR[m], w2 = WI[m];
        Fr[p] += w1 * yr - w2 * yi; Fi[p] += w1 * yi + w2 * yr;
      }
      GS0.s = s;
      // the other half plane: complex conjugates
      for (let m = 0; m < M; m++) { const p = MP[m], c = conj[p]; Fr[c] = Fr[p]; Fi[c] = -Fi[p]; }
      re.set(Fr); im.set(Fi);
      O.FFT.fft2(re, im, N, tb, wk, +1);
      const fo = t * P, inv = 1 / P;
      for (let p = 0; p < P; p++) {
        let e = bgE + re[p] * inv;
        if (e < 0) e = 0;
        e += Math.sqrt(e) * gn() + readE * gn();
        if (e > fullWell) e = fullWell;
        frames[fo + p] = e; re[p] = e; im[p] = 0;
      }
      O.FFT.fft2(re, im, N, tb, wk, -1);
      const fo2 = 2 * fo;
      for (let p = 0; p < P; p++) { fft[fo2 + 2 * p] = re[p]; fft[fo2 + 2 * p + 1] = im[p]; }
      if ((t & 7) === 7) yield { stage: "Recording the movie", frac: 0.05 + 0.95 * (t + 1) / T };
    }
    for (let r = 0; r <= N / 2; r++) amp[r] = cnt[r] > 0 ? amp[r] / cnt[r] : NaN;
    const qRing = new Float64Array(N / 2 + 1); for (let r = 0; r <= N / 2; r++) qRing[r] = TWO_PI * r / L;
    return {
      n: N, T: T, frames: frames, fft: fft, pixel_um: a, L_um: L, frame_rate_hz: fr, exposure_s: expo, T_C: T_C,
      viscosity_Pa_s: cfg.liquid.viscosity_mPa_s !== undefined ? cfg.liquid.viscosity_mPa_s * 1e-3 : O.viscosityWaterGlycerol_mPa_s(cfg.liquid.glycerol_w || 0, T_C) * 1e-3,
      q_opt_per_um: TWO_PI * Math.min(na, 1.34) / lamRef, q_signal_max_per_um: qcut,
      info: { mode: "brightfield", cell_z_um: [zlo, zhi], dark: false, n_particles: Math.round(Nbox), n_modes: M, kz_modes: Mz + 1, timing: "global",
              read_noise_e: readE, excess_noise: 1, detector_kind: "camera", full_well_e: fullWell, background_e: bgE, split: false,
              kernel: { Kr: Tk.Kr, Ki: Tk.Ki, nd: 1, z_um: zk }, kernel_q: qk, field: true },
      truth: { field: true, n_proteins: Nbox, S0: S0, Dc_um2_s: Dc, D_um2_s: Dc, amplitude: { q_per_um: Array.from(qRing), A: Array.from(amp) } }
    };
  }
  return { simulate: simulate };
});
