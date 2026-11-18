/* A confluent cell monolayer, simulated as self-propelled soft discs, and filmed as fluorescent nuclei.
 *
 * Model (overdamped, 2D, periodic box; Szabo et al., Phys. Rev. E 74, 061908, 2006; Henkes, Fily and Marchetti, Phys.
 * Rev. E 84, 040301, 2011): each cell i is a disc of diameter s_i (polydisperse, so that the sheet does not crystallise),
 *   dr_i/dt = v0 n_i + mu sum_j F_ij,   F_ij = k (s_ij - r_ij) r_ij / r_ij  for overlapping neighbours (s_ij = (s_i + s_j) / 2)
 *   dtheta_i/dt = -J sin(theta_i - phi_i) + sqrt(2 Dr) xi_i
 * with n_i = (cos theta_i, sin theta_i) the polarity, phi_i the direction of the cell's own velocity (alignment of the
 * polarity to the velocity, the feedback used by Giavazzi et al., Soft Matter 14, 3471, 2018), Dr rotational noise.
 * Units: micrometres and hours. mu k sets how fast an overlap relaxes.
 *
 * Image: each nucleus a Gaussian spot (an H2B-GFP stain seen at low magnification; not computed optics), photons per
 * nucleus per exposure, a background, shot noise and read noise, on a camera of given pixel size.
 *
 * cfg: seed, n_px, pixel_um, n_frames, frame_min (time between frames, minutes), cell_um (mean diameter), poly (relative
 *   spread of diameters), packing (area fraction, sum of disc areas over the box), v0_um_h, J_h (alignment rate),
 *   Dr_h (rotational noise), muk_h (mu k, 1/h), nucleus_um (rms radius of the spot), photons (per nucleus per frame),
 *   background (photons per pixel per frame), read_noise_e
 */
(function (root) {
  "use strict";
  function need(c, m) { if (!c) throw new Error("Tissue: " + m); }
  function num(o, k, lo, hi) { const v = o[k]; need(typeof v === "number" && isFinite(v) && v >= lo && v <= hi, k + " must be a number from " + lo + " to " + hi); return v; }
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const u = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    let spare = null;
    const g = function () { if (spare !== null) { const v = spare; spare = null; return v; } let a, b, r; do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = b * f; return a * f; };
    return { u: u, g: g };
  }
  // radix-2 FFT of one row or column (in place)
  function fft1(re, im, n) {
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  function fft2(img, n, out, o) {
    const re = new Float64Array(n), im = new Float64Array(n), R = new Float64Array(n * n), I = new Float64Array(n * n);
    for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) { re[x] = img[y * n + x]; im[x] = 0; } fft1(re, im, n); for (let x = 0; x < n; x++) { R[y * n + x] = re[x]; I[y * n + x] = im[x]; } }
    for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) { re[y] = R[y * n + x]; im[y] = I[y * n + x]; } fft1(re, im, n); for (let y = 0; y < n; y++) { out[o + 2 * (y * n + x)] = re[y]; out[o + 2 * (y * n + x) + 1] = im[y]; } }
  }

  function* simulate(cfg) {
    const n = num(cfg, "n_px", 32, 256); need((n & (n - 1)) === 0, "image size must be a power of two");
    const a = num(cfg, "pixel_um", 0.1, 20), T = num(cfg, "n_frames", 16, 2048); need(n * n * T <= (1 << 23), "movie too large for the browser");
    const dtF = num(cfg, "frame_min", 0.1, 120) / 60, sig = num(cfg, "cell_um", 5, 50), poly = num(cfg, "poly", 0, 0.4), pack = num(cfg, "packing", 0.5, 1.3);
    const v0 = num(cfg, "v0_um_h", 0, 200), J = num(cfg, "J_h", 0, 100), Dr = num(cfg, "Dr_h", 0, 100), muk = num(cfg, "muk_h", 0.1, 1000);
    const rn = num(cfg, "nucleus_um", 0.5, 20), ph = num(cfg, "photons", 1, 1e7), bg = num(cfg, "background", 0, 1e6), rd = num(cfg, "read_noise_e", 0, 50);
    const rng = makeRng(cfg.seed), L = n * a;
    // cell sizes and count for the area fraction asked
    const meanA = Math.PI / 4 * sig * sig * (1 + poly * poly), N = Math.max(4, Math.round(pack * L * L / meanA));
    const S = new Float64Array(N), X = new Float64Array(N), Y = new Float64Array(N), TH = new Float64Array(N), VX = new Float64Array(N), VY = new Float64Array(N);
    const UX = new Float64Array(N), UY = new Float64Array(N);   // unwrapped positions, for the truth
    for (let i = 0; i < N; i++) { S[i] = sig * Math.max(0.5, 1 + poly * rng.g()); X[i] = rng.u() * L; Y[i] = rng.u() * L; TH[i] = 2 * Math.PI * rng.u(); }
    const sMax = Math.max.apply(null, Array.from(S)), nc = Math.max(1, Math.floor(L / sMax)), cs = L / nc;
    const head = new Int32Array(nc * nc), next = new Int32Array(N), FX = new Float64Array(N), FY = new Float64Array(N);
    const h = Math.min(0.1 / muk, 0.05 * sig / Math.max(v0, 1e-9), 0.05 / Math.max(J, Dr, 1e-9), dtF / 2);   // time step (h)
    const forces = function () {
      head.fill(-1); FX.fill(0); FY.fill(0);
      for (let i = 0; i < N; i++) { const c = (Math.floor(X[i] / cs) % nc) * nc + (Math.floor(Y[i] / cs) % nc); next[i] = head[c]; head[c] = i; }
      for (let cx = 0; cx < nc; cx++) for (let cy = 0; cy < nc; cy++) {
        for (let i = head[cx * nc + cy]; i >= 0; i = next[i]) {
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const c2 = (((cx + dx) % nc + nc) % nc) * nc + (((cy + dy) % nc + nc) % nc);
            for (let j = head[c2]; j >= 0; j = next[j]) {
              if (j <= i) continue;
              let rx = X[j] - X[i], ry = Y[j] - Y[i]; rx -= L * Math.round(rx / L); ry -= L * Math.round(ry / L);
              const r = Math.hypot(rx, ry), s0 = 0.5 * (S[i] + S[j]); if (r >= s0 || r === 0) continue;
              const f = muk * (s0 - r) / r; FX[i] -= f * rx; FY[i] -= f * ry; FX[j] += f * rx; FY[j] += f * ry;
            }
          }
        }
      }
    };
    const stepOnce = function () {
      forces();
      const sr = Math.sqrt(2 * Dr * h);
      for (let i = 0; i < N; i++) {
        const vx = v0 * Math.cos(TH[i]) + FX[i], vy = v0 * Math.sin(TH[i]) + FY[i];
        VX[i] = vx; VY[i] = vy;
        X[i] += vx * h; Y[i] += vy * h; UX[i] += vx * h; UY[i] += vy * h;
        X[i] -= L * Math.floor(X[i] / L); Y[i] -= L * Math.floor(Y[i] / L);
        const sp = vx * vx + vy * vy;
        TH[i] += (sp > 1e-18 && J > 0 ? -J * Math.sin(TH[i] - Math.atan2(vy, vx)) * h : 0) + sr * rng.g();
      }
    };
    // settle: push the random start apart, then let the sheet run for a few persistence times (or a few hours) before filming
    const vSave = v0;
    for (let k = 0; k < 400; k++) { forces(); for (let i = 0; i < N; i++) { X[i] = ((X[i] + FX[i] * 0.1 / muk) % L + L) % L; Y[i] = ((Y[i] + FY[i] * 0.1 / muk) % L + L) % L; } }
    const tSettle = Math.max(6, 5 / Math.max(Dr, 0.1), 5 / Math.max(J, 0.1));
    const nSettle = Math.ceil(tSettle / h);
    for (let k = 0; k < nSettle; k++) { stepOnce(); if (k % 500 === 499) yield { stage: "Letting the cells settle", frac: 0.3 * k / nSettle }; }
    UX.set(X); UY.set(Y);
    // film
    const P = n * n, frames = new Float32Array(T * P), fftArr = new Float64Array(2 * T * P), img = new Float64Array(P);
    const per = Math.max(1, Math.round(dtF / h)), hh = dtF / per;
    const R = Math.ceil(3 * rn / a), inv = 1 / (2 * rn * rn), norm = ph * a * a / (2 * Math.PI * rn * rn);
    const truthX = [], truthY = [], order = [], speed = [];
    const posX = new Float32Array(T * N), posY = new Float32Array(T * N);   // true positions in the field, frame by frame (for the network of nuclei)
    const rr = makeRng((cfg.seed >>> 0) + 7919);
    for (let t = 0; t < T; t++) {
      if (t > 0) for (let k = 0; k < per; k++) { const hs = h; void hs; stepOnce(); }
      truthX.push(Float64Array.from(UX)); truthY.push(Float64Array.from(UY)); posX.set(X, t * N); posY.set(Y, t * N);
      let ox = 0, oy = 0, vs = 0; for (let i = 0; i < N; i++) { const s = Math.hypot(VX[i], VY[i]); if (s > 0) { ox += VX[i] / s; oy += VY[i] / s; } vs += s; }
      order.push(Math.hypot(ox, oy) / N); speed.push(vs / N);
      img.fill(bg);
      for (let i = 0; i < N; i++) {
        const cx = X[i] / a - 0.5, cy = Y[i] / a - 0.5, x0 = Math.round(cx) - R, y0 = Math.round(cy) - R;
        for (let y = y0; y <= y0 + 2 * R; y++) { const dy = (y - cy) * a, row = ((y % n) + n) % n * n; for (let x = x0; x <= x0 + 2 * R; x++) { const dx = (x - cx) * a; img[row + ((x % n) + n) % n] += norm * Math.exp(-(dx * dx + dy * dy) * inv); } }
      }
      const o = t * P;
      for (let p = 0; p < P; p++) { const m = img[p]; frames[o + p] = Math.max(0, m + Math.sqrt(m) * rr.g()) + rd * rr.g(); }
      fft2(frames.subarray(o, o + P), n, fftArr, 2 * o);
      if (t % 8 === 7) yield { stage: "Filming the monolayer", frac: 0.3 + 0.7 * (t + 1) / T };
    }
    // truth: mean squared displacement in the frame of the centre of mass, its drift (the flock), and the order
    const lagsT = []; for (let k = 1; k < T; k = Math.max(k + 1, Math.round(k * 1.25))) lagsT.push(k);
    const msd = lagsT.map(function (k) {
      let s = 0, c = 0;
      for (let t = 0; t + k < T; t += Math.max(1, Math.floor((T - k) / 64))) {
        let mx = 0, my = 0; for (let i = 0; i < N; i++) { mx += truthX[t + k][i] - truthX[t][i]; my += truthY[t + k][i] - truthY[t][i]; } mx /= N; my /= N;
        for (let i = 0; i < N; i++) { const dx = truthX[t + k][i] - truthX[t][i] - mx, dy = truthY[t + k][i] - truthY[t][i] - my; s += dx * dx + dy * dy; } c += N;
      }
      return s / c;
    });
    const cmx = (truthX[T - 1].reduce(function (q, v) { return q + v; }, 0) - truthX[0].reduce(function (q, v) { return q + v; }, 0)) / N, cmy = (truthY[T - 1].reduce(function (q, v) { return q + v; }, 0) - truthY[0].reduce(function (q, v) { return q + v; }, 0)) / N;
    const tSpan = (T - 1) * dtF;
    yield { stage: "Filming the monolayer", frac: 1 };
    return {
      n: n, T: T, frames: frames, fft: fftArr, pixel_um: a, L_um: L, frame_rate_hz: 1 / dtF, frame_h: dtF,   // "frame_rate_hz" is per hour here: the shared engine then gives delays in hours
      q_opt_per_um: 1 / rn, q_signal_max_per_um: 3 / rn,
      info: { detector_kind: "camera", read_noise_e: rd, excess_noise: 1, n_cells: N, step_h: h },
      truth: { n_cells: N, cell_um: sig, v0_um_h: v0, J_h: J, Dr_h: Dr, muk_h: muk, packing: N * meanA / (L * L),
        msd: { lag_h: lagsT.map(function (k) { return k * dtF; }), um2: msd }, drift_um_h: [cmx / tSpan, cmy / tSpan],
        order: order.reduce(function (q, v) { return q + v; }, 0) / T, speed_um_h: speed.reduce(function (q, v) { return q + v; }, 0) / T,
        positions: { x: posX, y: posY },
        snapshot: { x: Array.from(X), y: Array.from(Y), vx: Array.from(VX), vy: Array.from(VY), d: Array.from(S) } }
    };
  }
  const api = { simulate: simulate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TISSUE_MOVIE = api;
})(this);
