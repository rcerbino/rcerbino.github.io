/* DDM engine for the cerbino.eu DDM page.
 *
 * Two parts, kept separate on purpose:
 *   1. simulate(): a bright-field microscope movie of Brownian particles.
 *   2. analyse():  Differential Dynamic Microscopy on any movie, following the
 *      steps of fastDDM (Lattuada et al., J. Chem. Phys. 163, 161501 (2025);
 *      github.com/somexlab/fastddm), so the page teaches the same procedure:
 *        - image structure function d(q, dt) = < |F(q, t+dt) - F(q, t)|^2 >_t
 *        - azimuthal average, central cross (kx = 0 or ky = 0) masked
 *        - first guesses: B(q) from the noise floor, A(q) + B(q) = 2 var(q)
 *        - fit d = A (1 - exp(-(Gamma dt)^beta)) + B for every q
 *        - keep q inside [2 pi / field of view, 2 pi NA / wavelength] and
 *          Gamma inside [1 / longest lag, 1 / shortest lag]
 *        - Gamma = D q^2  ->  D  ->  diameter from Stokes-Einstein
 *        - particles that turn (anisotropic or birefringent): two modes per q,
 *          f = a exp(-Gamma_1 dt) + (1 - a) exp(-Gamma_2 dt), Gamma_1 = D_T q^2,
 *          Gamma_2 = D_T q^2 + 6 D_R (Giavazzi et al., J. Phys.: Condens. Matter 28,
 *          195201 (2016); Cerbino et al., ibid. 30, 025901 (2018))
 *        - optional squared-gradient images before the analysis (Giavazzi, Pal and
 *          Cerbino, Eur. Phys. J. E 44, 61 (2021))
 *
 * Units are written into the names: _um (micrometre), _s (second),
 * _hz (1/s), _C (Celsius), _K (kelvin), _Pa_s (pascal second),
 * _per_um (1/micrometre), _um2_s (um^2/s).
 * The analysis never reads the simulation's true values; those are only
 * passed back for the "measured vs true" comparison on the page.
 */
(function (root) {
  "use strict";

  // ---- physical constants and fixed instrument settings -------------------
  const BOLTZMANN_J_PER_K = 1.380649e-23;      // exact (SI 2019)
  const ZERO_C_IN_K = 273.15;
  const CAMERA_PIXEL_UM = 6.5;                  // sCMOS pixel (as in the fastDDM tutorials)
  const WAVELENGTH_UM = 0.55;                   // green illumination

  function fail(msg) { throw new Error("DDM: " + msg); }
  function need(cond, msg) { if (!cond) fail(msg); }
  function needNum(obj, key, lo, hi) {
    const v = obj[key];
    need(typeof v === "number" && Number.isFinite(v), "missing or invalid setting '" + key + "'");
    need(v >= lo && v <= hi, "setting '" + key + "' = " + v + " is outside [" + lo + ", " + hi + "]");
    return v;
  }

  // Water viscosity, Vogel equation: eta = A * 10^(B / (T - C)),
  // A = 2.414e-5 Pa s, B = 247.8 K, C = 140 K (accurate to about 2.5 %, 0-100 C).
  function waterViscosity_Pa_s(T_C) {
    need(T_C > -1 && T_C < 101, "water temperature out of range: " + T_C);
    const T_K = T_C + ZERO_C_IN_K;
    return 2.414e-5 * Math.pow(10, 247.8 / (T_K - 140));
  }

  // Stokes-Einstein: D = k T / (3 pi eta d)
  function diffusion_um2_s(diameter_um, T_C, viscosity_Pa_s) {
    const d_m = diameter_um * 1e-6;
    const D_m2_s = BOLTZMANN_J_PER_K * (T_C + ZERO_C_IN_K) / (3 * Math.PI * viscosity_Pa_s * d_m);
    return D_m2_s * 1e12;
  }
  function diameterFromD_um(D_um2_s, T_C, viscosity_Pa_s) {
    const D_m2_s = D_um2_s * 1e-12;
    return BOLTZMANN_J_PER_K * (T_C + ZERO_C_IN_K) / (3 * Math.PI * viscosity_Pa_s * D_m2_s) * 1e6;
  }

  // ---- random numbers (seeded, reproducible) ------------------------------
  function makeRng(seed) {
    need(Number.isInteger(seed), "seed must be an integer");
    let a = seed >>> 0;
    const uniform = function () {             // mulberry32
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let spare = null;
    const gauss = function () {               // Box-Muller
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0; while (u === 0) u = uniform();
      const v = uniform();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
    return { uniform: uniform, gauss: gauss };
  }

  // erf, Abramowitz and Stegun 7.1.26 (absolute error below 1.5e-7)
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  // ---- FFT (radix 2, in place) ---------------------------------------------
  function makeFftTables(n) {
    need(n >= 2 && (n & (n - 1)) === 0, "image size must be a power of two, got " + n);
    let bits = 0; while ((1 << bits) < n) bits++;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
    return { n: n, rev: rev, cos: cos, sin: sin };
  }
  function fft1d(re, im, tb) {
    const n = tb.n, rev = tb.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const c = tb.cos[k * step], s = tb.sin[k * step];
          const a = start + k, b = a + half;
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  // 2D FFT of a real n x n image (row-major), result written as interleaved re,im
  function fft2dReal(img, n, tb, out, outOffset, work) {
    const re = work.re, im = work.im, cr = work.cr, ci = work.ci;
    for (let p = 0; p < n * n; p++) { re[p] = img[p]; im[p] = 0; }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) { cr[x] = re[y * n + x]; ci[x] = im[y * n + x]; }
      fft1d(cr, ci, tb);
      for (let x = 0; x < n; x++) { re[y * n + x] = cr[x]; im[y * n + x] = ci[x]; }
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) { cr[y] = re[y * n + x]; ci[y] = im[y * n + x]; }
      fft1d(cr, ci, tb);
      for (let y = 0; y < n; y++) { re[y * n + x] = cr[y]; im[y * n + x] = ci[y]; }
    }
    for (let p = 0; p < n * n; p++) { out[outOffset + 2 * p] = re[p]; out[outOffset + 2 * p + 1] = im[p]; }
  }
  function makeWork(n) {
    return { re: new Float64Array(n * n), im: new Float64Array(n * n), cr: new Float64Array(n), ci: new Float64Array(n) };
  }

  // ---- 1. simulation --------------------------------------------------------
  /* cfg (every field required, no defaults):
   *   seed, n_px, n_frames, frame_rate_hz, magnification, na,
   *   diameter_um, size_spread (relative standard deviation, 0 = identical),
   *   n_particles, T_C, viscosity_factor (solvent viscosity / water viscosity),
   *   noise_frac (camera noise, standard deviation / background),
   *   exposure_frac (exposure time / frame interval, 0 to 1),
   *   drift_um_s (uniform drift along x)
   */
  const SUBSTEPS = 4;                 // time sub-steps per frame (for exposure blur)
  const CONTRAST_GAIN = 2.0;          // spot weight scale (dimensionless, sets visibility)
  const CONTRAST_SAT_UM = 0.5;        // size where bright-field contrast stops growing as d^3

  function checkSimConfig(c) {
    needNum(c, "seed", 0, 4294967295);
    const n = needNum(c, "n_px", 32, 512); makeFftTables(n);
    needNum(c, "n_frames", 16, 2048);
    needNum(c, "frame_rate_hz", 0.1, 10000);
    needNum(c, "magnification", 1, 200);
    needNum(c, "na", 0.05, 1.5);
    needNum(c, "diameter_um", 0.005, 20);
    needNum(c, "size_spread", 0, 0.6);
    needNum(c, "n_particles", 1, 20000);
    needNum(c, "T_C", 0, 100);
    needNum(c, "viscosity_factor", 0.1, 2000);
    needNum(c, "noise_frac", 0, 1);
    needNum(c, "exposure_frac", 0, 1);
    needNum(c, "drift_um_s", 0, 1000);
    need(c.n_px * c.n_px * c.n_frames <= (1 << 23), "movie too large for the browser (pixels x frames above 8.4 million)");
  }

  function* simulate(cfg) {
    checkSimConfig(cfg);
    const n = cfg.n_px, T = cfg.n_frames;
    const pixel_um = CAMERA_PIXEL_UM / cfg.magnification;
    const L_um = n * pixel_um;
    const dt_s = 1 / cfg.frame_rate_hz;
    const sub_dt_s = dt_s / SUBSTEPS;
    const exposedSubsteps = Math.max(1, Math.round(cfg.exposure_frac * SUBSTEPS));
    const eta_Pa_s = waterViscosity_Pa_s(cfg.T_C) * cfg.viscosity_factor;
    const psfSigma_um = 0.21 * WAVELENGTH_UM / cfg.na;   // Gaussian approximation of the Airy spot
    const rng = makeRng(cfg.seed);

    // particles: lognormal sizes with the requested mean and relative spread
    const N = cfg.n_particles;
    const x = new Float64Array(N), y = new Float64Array(N), d_um = new Float64Array(N);
    const step_um = new Float64Array(N), w = new Float64Array(N), sig_px = new Float64Array(N);
    const s2 = Math.log(1 + cfg.size_spread * cfg.size_spread);
    for (let i = 0; i < N; i++) {
      x[i] = rng.uniform() * L_um; y[i] = rng.uniform() * L_um;
      d_um[i] = cfg.size_spread > 0 ? cfg.diameter_um * Math.exp(Math.sqrt(s2) * rng.gauss() - s2 / 2) : cfg.diameter_um;
      const D = diffusion_um2_s(d_um[i], cfg.T_C, eta_Pa_s);
      step_um[i] = Math.sqrt(2 * D * sub_dt_s);
      const d3 = Math.pow(d_um[i], 3);
      w[i] = CONTRAST_GAIN * d3 / (d3 + Math.pow(CONTRAST_SAT_UM, 3));    // dark spot weight
      // spot width: optical blur and particle size combined
      sig_px[i] = Math.sqrt(psfSigma_um * psfSigma_um + Math.pow(d_um[i] / 4, 2)) / pixel_um;
    }

    const frames = new Float32Array(n * n * T);     // intensity, background = 1
    const fft = new Float32Array(2 * n * n * T);    // 2D FFT of every frame
    const img = new Float64Array(n * n);
    const tb = makeFftTables(n), work = makeWork(n);
    const wx = new Float64Array(64), wy = new Float64Array(64);
    const driftStep_um = cfg.drift_um_s * sub_dt_s;

    for (let t = 0; t < T; t++) {
      img.fill(0);
      for (let s = 0; s < SUBSTEPS; s++) {
        if (s < exposedSubsteps) {
          for (let i = 0; i < N; i++) {
            const sg = sig_px[i], R = Math.min(30, Math.ceil(3 * sg + 0.5));
            const px = x[i] / pixel_um - 0.5, py = y[i] / pixel_um - 0.5;  // pixel centres at integer + 0.5
            const cx = Math.round(px), cy = Math.round(py);
            const k = 1 / (Math.SQRT2 * sg);
            // pixel-integrated Gaussian: erf evaluated once per pixel edge
            let ex0 = erf((cx - R - 0.5 - px) * k), ey0 = erf((cy - R - 0.5 - py) * k);
            for (let j = -R; j <= R; j++) {
              const ex1 = erf((cx + j + 0.5 - px) * k), ey1 = erf((cy + j + 0.5 - py) * k);
              wx[j + R] = 0.5 * (ex1 - ex0); wy[j + R] = 0.5 * (ey1 - ey0);
              ex0 = ex1; ey0 = ey1;
            }
            const amp = w[i] / exposedSubsteps;
            for (let jy = -R; jy <= R; jy++) {
              const row = ((cy + jy) % n + n) % n;
              const wyv = amp * wy[jy + R];
              for (let jx = -R; jx <= R; jx++) {
                const col = ((cx + jx) % n + n) % n;
                img[row * n + col] += wyv * wx[jx + R];
              }
            }
          }
        }
        for (let i = 0; i < N; i++) {      // Brownian step (+ drift), periodic box
          x[i] += step_um[i] * rng.gauss() + driftStep_um;
          y[i] += step_um[i] * rng.gauss();
          x[i] -= L_um * Math.floor(x[i] / L_um);
          y[i] -= L_um * Math.floor(y[i] / L_um);
        }
      }
      const off = t * n * n;
      for (let p = 0; p < n * n; p++) {
        const v = 1 - img[p] + cfg.noise_frac * rng.gauss();
        frames[off + p] = v;
        img[p] = v;
      }
      fft2dReal(img, n, tb, fft, 2 * off, work);
      if ((t & 7) === 7) yield { stage: "Recording the movie", frac: (t + 1) / T };
    }

    // values the analysis must recover (kept apart from the movie)
    let sw2 = 0, sw2D = 0, sd = 0;
    for (let i = 0; i < N; i++) {
      const D = diffusion_um2_s(d_um[i], cfg.T_C, eta_Pa_s);
      sw2 += w[i] * w[i]; sw2D += w[i] * w[i] * D; sd += d_um[i];
    }
    const D_seen = sw2D / sw2;   // contrast-weighted mean (what DDM measures for a mixture)
    return {
      n: n, T: T, frames: frames, fft: fft,
      pixel_um: pixel_um, L_um: L_um, frame_rate_hz: cfg.frame_rate_hz,
      na: cfg.na, wavelength_um: WAVELENGTH_UM,
      T_C: cfg.T_C, viscosity_Pa_s: eta_Pa_s,
      truth: {
        diameter_um: cfg.diameter_um,
        mean_diameter_um: sd / N,
        D_um2_s: diffusion_um2_s(cfg.diameter_um, cfg.T_C, eta_Pa_s),
        D_seen_um2_s: D_seen,
        diameter_seen_um: diameterFromD_um(D_seen, cfg.T_C, eta_Pa_s),
        drift_um_s: cfg.drift_um_s
      }
    };
  }

  // ---- 2. analysis ----------------------------------------------------------
  function logspaceLags(maxLag, num) {          // like fastddm.lags.logspace_int
    const out = [];
    for (let i = 0; i < num; i++) {
      const v = Math.round(Math.exp(Math.log(maxLag) * i / (num - 1)));
      if (out.length === 0 || v > out[out.length - 1]) out.push(v);
    }
    return out;
  }

  // squared gradient of every frame (periodic central differences), then its Fourier transform
  function squaredGradientFft(movie) {
    const n = movie.n, T = movie.T, P = n * n, out = new Float32Array(2 * P * T), img = new Float64Array(P);
    const tb = makeFftTables(n), work = makeWork(n);
    for (let t = 0; t < T; t++) {
      const o = t * P, f = movie.frames;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const xp = (x + 1) % n, xm = (x + n - 1) % n, yp = (y + 1) % n, ym = (y + n - 1) % n;
        const gxv = 0.5 * (f[o + y * n + xp] - f[o + y * n + xm]), gyv = 0.5 * (f[o + yp * n + x] - f[o + ym * n + x]);
        img[y * n + x] = gxv * gxv + gyv * gyv;
      }
      fft2dReal(img, n, tb, out, 2 * P * t, work);
    }
    return out;
  }

  /* opts (required): fit_model ("simple" | "stretched" | "schulz" | "two" | "three"),
   *   q_min_per_um, q_max_per_um (fit range chosen by the user; null = full measurable range),
   *   images (optional): "recorded" (default) or "squared_gradient"
   */
  function* analyse(movie, opts) {
    need(["simple", "stretched", "schulz", "two", "three"].indexOf(opts.fit_model) >= 0, "fit_model must be simple, stretched, schulz, two or three");
    const rotFit = opts.fit_model === "two" || opts.fit_model === "three";
    need("q_min_per_um" in opts && "q_max_per_um" in opts, "q range missing (use null for the full range)");
    const images = opts.images === undefined ? "recorded" : opts.images;
    need(images === "recorded" || images === "squared_gradient", "images must be recorded or squared_gradient");
    const sg = images === "squared_gradient";
    if (sg) yield { stage: "Squared gradient of each frame", frac: 0 };
    const n = movie.n, T = movie.T, P = n * n, fft = sg ? squaredGradientFft(movie) : movie.fft;
    const lags = logspaceLags(Math.floor(T / 2), 40);
    const L = lags.length;
    const dt_s = 1 / movie.frame_rate_hz;
    const taus_s = lags.map(function (m) { return m * dt_s; });

    // wave vector of every Fourier pixel, bin = nearest integer |k|
    const nb = n / 2;
    const binOf = new Int32Array(P).fill(-1);
    const nmodes = new Float64Array(nb + 1);
    for (let iy = 0; iy < n; iy++) {
      const ky = iy < n / 2 ? iy : iy - n;
      for (let ix = 0; ix < n; ix++) {
        const kx = ix < n / 2 ? ix : ix - n;
        if (kx === 0 || ky === 0) continue;       // central cross mask (fastddm.mask.central_cross_mask)
        const b = Math.round(Math.sqrt(kx * kx + ky * ky));
        if (b < 1 || b > nb) continue;
        binOf[iy * n + ix] = b; nmodes[b]++;
      }
    }
    const q_per_um = new Float64Array(nb + 1);
    for (let b = 0; b <= nb; b++) q_per_um[b] = 2 * Math.PI * b / movie.L_um;

    // structure function d(q, dt), kept in 2D (for the map) and azimuthally averaged
    const d2d = [];                                   // per lag: Float32Array(P), normalised by P
    const dq = [];                                    // per lag: Float64Array(nb + 1)
    for (let li = 0; li < L; li++) {
      const m = lags[li];
      const acc = new Float64Array(P);
      let count = 0;
      for (let t = 0; t + m < T; t++) {
        const o1 = 2 * P * t, o2 = 2 * P * (t + m);
        for (let p = 0; p < P; p++) {
          const dr = fft[o2 + 2 * p] - fft[o1 + 2 * p], di = fft[o2 + 2 * p + 1] - fft[o1 + 2 * p + 1];
          acc[p] += dr * dr + di * di;
        }
        count++;
      }
      need(count > 0, "lag longer than the movie");
      const map = new Float32Array(P);
      const avg = new Float64Array(nb + 1);
      for (let p = 0; p < P; p++) {
        const v = acc[p] / count / P;               // per-pixel normalisation: B = 2 x noise variance
        map[p] = v;
        const b = binOf[p]; if (b > 0) avg[b] += v;
      }
      for (let b = 1; b <= nb; b++) avg[b] = nmodes[b] > 0 ? avg[b] / nmodes[b] : NaN;
      d2d.push(map); dq.push(avg);
      yield { stage: "Comparing frames", frac: (li + 1) / L };
    }

    // temporal variance per mode: A + B = 2 var
    const varq = new Float64Array(nb + 1);
    {
      const mr = new Float64Array(P), mi = new Float64Array(P), m2 = new Float64Array(P);
      for (let t = 0; t < T; t++) {
        const o = 2 * P * t;
        for (let p = 0; p < P; p++) {
          const r = fft[o + 2 * p], i = fft[o + 2 * p + 1];
          mr[p] += r; mi[p] += i; m2[p] += r * r + i * i;
        }
      }
      for (let p = 0; p < P; p++) {
        const b = binOf[p]; if (b <= 0) continue;
        const v = (m2[p] / T - (mr[p] * mr[p] + mi[p] * mi[p]) / (T * T)) / P;
        varq[b] += v;
      }
      for (let b = 1; b <= nb; b++) varq[b] = nmodes[b] > 0 ? varq[b] / nmodes[b] : NaN;
    }

    // measurable window (fastDDM tutorial 1, section 2.C)
    const q_lo_per_um = 2 * Math.PI / movie.L_um;
    need(typeof movie.q_opt_per_um === "number" && typeof movie.q_signal_max_per_um === "number", "movie lacks its optical cut-offs");
    // squaring doubles the band of the image
    const q_nyq_per_um = Math.PI / movie.pixel_um;
    const q_opt_per_um = sg ? Math.min(2 * movie.q_opt_per_um, q_nyq_per_um) : movie.q_opt_per_um;
    const q_sig_per_um = sg ? 2 * movie.q_signal_max_per_um : movie.q_signal_max_per_um;
    const q_hi_per_um = Math.min(q_opt_per_um, q_nyq_per_um);
    const gamma_lo_hz = 1 / taus_s[L - 1];
    const gamma_hi_hz = 1 / taus_s[0];

    // noise floor: the plateau beyond the last wave vector that carries signal, when the camera samples it
    const beyond = [];
    for (let b = 1; b <= nb; b++) if (q_per_um[b] > 1.05 * q_sig_per_um) beyond.push(dq[0][b]);
    beyond.sort(function (a, c) { return a - c; });
    const B_floor = beyond.length >= 4 ? beyond[Math.floor(beyond.length / 2)] : null;

    // noise estimate per q as in fastddm.noise_est.estimate_camera_noise(mode="polyfit", num_points=5):
    // zero-delay intercept of a quadratic fit over the first five delays. Used when the camera does not
    // sample a flat noise floor beyond the optical cut-off.
    const B_est = new Float64Array(nb + 1).fill(NaN), A_est = new Float64Array(nb + 1).fill(NaN);
    for (let b = 1; b <= nb; b++) {
      if (!(nmodes[b] > 0)) continue;
      const np5 = Math.min(5, L);
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < np5; i++) { const t = taus_s[i], v = dq[i][b]; s0++; s1 += t; s2 += t * t; s3 += t * t * t; s4 += t * t * t * t; y0 += v; y1 += v * t; y2 += v * t * t; }
      const M3 = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
      const c = solve(M3, [y0, y1, y2]);
      let Bq = c === null ? dq[0][b] : c[0];
      Bq = Math.max(0, Math.min(Bq, dq[0][b]));
      if (B_floor !== null) Bq = Math.min(B_floor, dq[0][b]);
      B_est[b] = Bq; A_est[b] = 2 * varq[b] - Bq;
    }
    // fit every q
    const stretched = opts.fit_model === "stretched", kind = opts.fit_model === "stretched" || opts.fit_model === "schulz" ? opts.fit_model : "simple";
    const fits = [];
    for (let b = 1; b <= nb; b++) {
      if (!(nmodes[b] > 0)) { fits.push(null); continue; }
      const yv = new Float64Array(L);
      for (let li = 0; li < L; li++) yv[li] = dq[li][b];
      const f1 = fitOne(taus_s, yv, varq[b], B_est[b], kind, b, q_per_um[b]);
      fits.push(rotFit ? fitTwo(taus_s, yv, f1) : f1);
      if ((b & 7) === 0) yield { stage: "Fitting", frac: b / nb };
    }

    const qmin = opts.q_min_per_um === null ? 0 : opts.q_min_per_um;
    const qmax = opts.q_max_per_um === null ? Infinity : opts.q_max_per_um;
    const rows = fits.filter(function (f) { return f !== null; });
    for (const f of rows) {
      f.reason = null;
      if (f.q_per_um < 2 * q_lo_per_um) f.reason = "pattern as large as the image";
      else if (f.q_per_um > q_hi_per_um) f.reason = "finer than the microscope can see";
      else if (!f.ok) f.reason = "fit failed";
      else if (f.lnGamma_se > MAX_LN_GAMMA_SE) f.reason = "signal lost in camera noise";
      else if (f.gamma_hz <= gamma_lo_hz) f.reason = "too slow for this movie";
      else if (f.gamma_hz >= gamma_hi_hz) f.reason = "too fast for this frame rate";
      else if (f.q_per_um < qmin || f.q_per_um > qmax) f.reason = "outside the chosen fit range";
    }
    let used = rows.filter(function (f) { return f.reason === null; });
    let D = weightedD(used);
    if (D !== null) {   // tutorial step: drop points where D q^2 is already below the slowest measurable rate
      for (const f of used) if (D.D_um2_s * f.q_per_um * f.q_per_um < gamma_lo_hz) f.reason = "too slow for this movie";
      used = rows.filter(function (f) { return f.reason === null; });
      D = weightedD(used);
    }
    const slope = powerLaw(used);
    // cumulants (ISO 22412, A.1.2, written for the first-order f instead of g2 - 1): per used q
    // free Schulz fit of every used curve: plateau and noise for the cumulants, starting values for the shared fit
    const sfree = rotFit ? null : used.map(function (f) { const yv = new Float64Array(L); for (let i = 0; i < L; i++) yv[i] = dq[i][f.bin]; return { f: f, y: yv, fit: fitOne(taus_s, yv, varq[f.bin], B_est[f.bin], "schulz", f.bin, f.q_per_um) }; });
    const cum = rotFit ? null : cumulants(taus_s, dq, sfree);
    if (cum) { yield { stage: "Fitting one polydispersity to all q", frac: 0.96 }; cum.schulz_shared = sharedSchulz(taus_s, varq, B_est, sfree); }
    // ISO 22412 10.2 (result independent of the range analysed): D from the lower and the upper half of the used q
    let halves = null;
    if (!rotFit && used.length >= 8) {
      const h = Math.floor(used.length / 2), lo = weightedD(used.slice(0, h)), hi = weightedD(used.slice(h));
      if (lo && hi) halves = { low: lo, high: hi, q_split_per_um: used[h].q_per_um };
    }
    // repeatability: the same analysis on separate parts of the movie
    yield { stage: "Repeating the analysis on parts of the movie", frac: 0.97 };
    const blocks = rotFit ? null : blockAnalysis(fft, T, P, binOf, nb, lags, taus_s, used, B_est, kind);
    let rot = null;
    if (rotFit) {
      // global fit over all measurable q (shared D_T and D_R); per-q two-mode fits only give the starting values
      const gset = rows.filter(function (f) { return f.ok && f.q_per_um >= 2 * q_lo_per_um && f.q_per_um <= q_hi_per_um && f.q_per_um >= qmin && f.q_per_um <= qmax && f.lnGamma_se <= MAX_LN_GAMMA_SE; });
      const guess = rotation(rows, D, q_lo_per_um, q_hi_per_um, gamma_lo_hz, gamma_hi_hz);
      yield { stage: "Fitting translation and rotation together", frac: 0.95 };
      const g2 = globalTwo(taus_s, dq, gset, D ? D.D_um2_s : null, guess && guess.rate_s ? guess.rate_s : null, gamma_lo_hz, gamma_hi_hz, false);
      const g3 = g2 !== null && g2.rot.D_r_s ? globalTwo(taus_s, dq, gset, g2.D ? g2.D.D_um2_s : null, g2.rot.rate_s, gamma_lo_hz, gamma_hi_hz, true) : null;
      // the third mode is used only when asked for (fit_model "three"): left free, it can also lock onto a slower
      // spurious mode at about 0.3 of the true 6 D_R (tests: p-DDM at 75 deg, dark-field rods, squared gradient),
      // and the data alone did not tell the two apart. It is right for crossed polarizers (tests: -9 % and -17 %
      // against +80 % with two modes).
      const useThree = opts.fit_model === "three" && g3 !== null && g3.rot.D_r_s;
      if (DEBUG_TWO && g3 !== null) console.log("three modes: misfit " + g3.misfit.toExponential(3) + " vs two " + g2.misfit.toExponential(3) + ", 20 D_R share " + (g3.rot.l4_share || 0).toFixed(2) + ", 6 D_R = " + (g3.rot.rate_s || 0).toFixed(2) + " (two modes: " + g2.rot.rate_s.toFixed(2) + ")" + (useThree ? " -> three" : ""));
      const g = useThree ? g3 : g2;
      if (DEBUG_TWO) console.log("per-q estimate of 6 D_R: " + (guess && guess.rate_s ? guess.rate_s.toFixed(2) + " (" + guess.n_points + " q)" : "none") + ", global: " + (g && g.rot && g.rot.rate_s ? g.rot.rate_s.toFixed(2) : "none"));
      // a rotation must also show up at many single q: at least a quarter of the measurable q resolve a fast mode on
      // their own (tests: 60-95 % with rotating particles, about 10 % for slight bends from noise or axial motion)
      const nTwo = gset.filter(function (f) { return f.two; }).length;
      if (g !== null && g.rot.D_r_s && nTwo < Math.max(4, 0.25 * gset.length)) {
        g.rot = { D_r_s: null, n_points: gset.length, fast_share: g.rot.fast_share, gain: g.rot.gain, reason: "no clear rotational signal (a fast mode at only " + nTwo + " of " + gset.length + " q)" };
        g.D = null;
      }
      if (g !== null) {
        rot = g.rot;
        if (g.D) D = g.D;
        // rate of the fast mode: with D_T from the joint fit, the mean of Gamma_2 - D_T q^2 over the q where the
        // per-q fits resolve two modes is less biased than the joint value (tests: -1 % against -11 % over six
        // movies of birefringent spheres); the joint value is kept when fewer than 8 q resolve the fast mode or their scatter exceeds 20 %
        if (rot.D_r_s) {
          const perq = rotation(rows, D, q_lo_per_um, q_hi_per_um, gamma_lo_hz, gamma_hi_hz);
          rot.joint_rate_s = rot.rate_s;
          // per-q fits have only two modes, so they are not used when the third mode is present; they must also agree
          // with the joint value within 25 % (otherwise they are biased, e.g. by the squared gradient at high q)
          if (!useThree && perq && perq.D_r_s && perq.n_points >= 8 && perq.rel_err < 0.2 && Math.abs(perq.rate_s / rot.rate_s - 1) < 0.25) { rot.D_r_s = perq.D_r_s; rot.rate_s = perq.rate_s; rot.rel_err = perq.rel_err; rot.n_points = perq.n_points; rot.from = "per-q fast modes"; }
          else rot.from = useThree ? "joint fit with three modes" : "joint fit";
        }
      } else rot = { D_r_s: null, n_points: 0, reason: "too few wave vectors to fit" };
    }
    const result = {
      lags: lags, taus_s: taus_s, q_per_um: q_per_um, nmodes: nmodes,
      dq: dq, d2d: d2d, varq: varq, fits: rows, used: used,
      window: { q_lo_per_um: q_lo_per_um, q_opt_per_um: q_opt_per_um, q_nyq_per_um: q_nyq_per_um, q_hi_per_um: q_hi_per_um,
                gamma_lo_hz: gamma_lo_hz, gamma_hi_hz: gamma_hi_hz },
      B_floor: B_floor, B_est: B_est, A_est: A_est, fit_model: opts.fit_model,
      D: D, slope: slope,
      diameter_um: D === null ? null : diameterFromD_um(D.D_um2_s, movie.T_C, movie.viscosity_Pa_s),
      diameter_rel_err: D === null ? null : (blocks ? Math.max(D.rel_err, blocks.rel_err_full) : D.rel_err),
      diameter_rel_err_points: D === null ? null : D.rel_err,
      beta_mean: stretched && used.length ? used.reduce(function (s, f) { return s + f.beta; }, 0) / used.length : null,
      // mean over q weighted like D (by the precision of each rate): PI is poorly fixed where the rate is
      pi_mean: opts.fit_model === "schulz" && used.length ? (function () { let sw = 0, sp = 0; used.forEach(function (f) { const w = 1 / (f.lnGamma_se * f.lnGamma_se + 1e-4); sw += w; sp += w * f.pi; }); return sp / sw; })() : null,
      cumulants: cum, blocks: blocks, halves: halves,
      images: images, rot: rot
    };
    return result;
  }

  // a q is used only if its rate is known to better than about 20 %
  const MAX_LN_GAMMA_SE = 0.2;
  let DEBUG_TWO = typeof process !== "undefined" && process.env && process.env.DDM_DEBUG_TWO === "1";

  /* Cumulants per q on f(dt) = 1 - (d - B) / A (A + B = 2 var, B as for the fits): ln f = -G dt + (mu2 / 2) dt^2,
   * weighted least squares with weights f^2 (constant noise on f). Range adapted from ISO 22412 A.1.2 to the
   * first-order f: from the first delay down to f = f1 / 10, with at least one point below f1 / 7 and at least 6
   * points. PI = mu2 / G^2. D from G / q^2 as for the fits (same weights); PI averaged over q. */
  function cumulants(taus, dq, sfree) {
    const per = [], schulzPer = [];
    for (const it of sfree) {
      // plateau A and noise B from a free fit of the whole curve (Schulz form, which allows for a spread of rates):
      // A = 2 var - B is biased low at q whose decay is not much shorter than the movie, and that bends ln f down
      const f = it.f, b = f.bin, fs = it.fit;
      if (!fs.ok) continue;
      const A = fs.A, B = fs.B;
      if (!(A > 0)) continue;
      schulzPer.push({ q_per_um: f.q_per_um, gamma_hz: fs.gamma_hz, pi: fs.pi, w: 1 / (fs.lnGamma_se * fs.lnGamma_se + 1e-4) });
      const pts = [];
      let f1 = null, low = false;
      for (let i = 0; i < taus.length; i++) {
        const v = 1 - (dq[i][b] - B) / A;
        if (f1 === null) { if (!(v > 0)) break; f1 = v; }
        if (!(v > f1 / 10)) break;
        if (v < f1 / 7) low = true;
        pts.push([taus[i], Math.log(v), v * v]);
      }
      if (pts.length < 6 || !low) continue;
      const poly = function (order) {
        const n = order + 1, S = [], R = new Float64Array(n);
        for (let a = 0; a < n; a++) S.push(new Float64Array(n));
        for (const [t, y, w] of pts) { const X = [1, -t, t * t / 2, -t * t * t / 6].slice(0, n); for (let a = 0; a < n; a++) { R[a] += w * X[a] * y; for (let c = 0; c < n; c++) S[a][c] += w * X[a] * X[c]; } }
        return solve(S, Array.from(R));
      };
      const c = poly(2);
      if (c === null || !(c[1] > 0)) continue;
      const c3 = pts.length >= 8 ? poly(3) : null;   // third order: less biased for broad distributions, noisier
      per.push({ q_per_um: f.q_per_um, gamma_hz: c[1], mu2: c[2], pi: c[2] / (c[1] * c[1]), w: 1 / (f.lnGamma_se * f.lnGamma_se + 1e-4), n: pts.length,
        gamma3_hz: c3 && c3[1] > 0 ? c3[1] : null, pi3: c3 && c3[1] > 0 ? c3[2] / (c3[1] * c3[1]) : null });
    }
    const summary = function (list) {
      if (list.length < 3) return null;
      let sw = 0, sx = 0, sp = 0;
      for (const e of list) { sw += e.w; sx += e.w * (Math.log(e.gamma_hz) - 2 * Math.log(e.q_per_um)); sp += e.w * e.pi; }
      const mean = sx / sw, piMean = sp / sw;
      let ss = 0, sq = 0; for (const e of list) { const r = Math.log(e.gamma_hz) - 2 * Math.log(e.q_per_um) - mean; ss += e.w * r * r; sq += e.w * (e.pi - piMean) * (e.pi - piMean); }
      return { D_um2_s: Math.exp(mean), rel_err: Math.sqrt(ss / ((list.length - 1) * sw)), pi: piMean, pi_err: Math.sqrt(sq / ((list.length - 1) * sw)), n_points: list.length };
    };
    const c = summary(per), z = summary(schulzPer);
    const out = c ? Object.assign({ per_q: per }, c) : { per_q: per, D_um2_s: null, pi: null };
    const per3 = per.filter(function (e) { return e.gamma3_hz !== null; }).map(function (e) { return { q_per_um: e.q_per_um, gamma_hz: e.gamma3_hz, pi: e.pi3, w: e.w }; });
    out.third = summary(per3);
    out.schulz = z ? Object.assign({ per_q: schulzPer }, z) : null;   // the Schulz fits of every curve (mean rate and PI)
    return out;
  }
  /* One Schulz polydispersity shared by all q (each q keeps its own A, B and mean rate): the PI is found by a golden-
   * section search of the summed chi^2, each curve weighted by its own residual variance from the free fit. Averaging
   * per-q PIs is biased upward (each is noisy and cannot go below 0); one shared PI is not. Uncertainty: the same fit on
   * 4 interleaved groups of q, standard deviation / 2. */
  function sharedSchulz(taus, varq, B_est, sfree) {
    const items = sfree.filter(function (it) { return it.fit.ok && it.fit.dof > 0 && it.fit.cost > 0; });
    if (items.length < 4) return null;
    const fitAll = function (list, PI) {
      let chi = 0; const fits = [];
      for (const it of list) {
        const st = it.fit;   // always from the free fit: warm starts from a distant PI can stall the fit
        const g = fitOne(taus, it.y, varq[it.f.bin], B_est[it.f.bin], "schulz", it.f.bin, it.f.q_per_um, { pi: PI, start: { A: st.A, B: st.B, G: st.gamma_hz } });
        if (!Number.isFinite(g.cost)) return { chi: Infinity, fits: null };
        it.last = g; chi += g.cost / (it.fit.cost / it.fit.dof); fits.push(g);
      }
      return { chi: chi, fits: fits };
    };
    const search = function (list) {
      list.forEach(function (it) { it.last = null; });
      const gr = (Math.sqrt(5) - 1) / 2; let a = -0.2, b = 0.6, x1 = b - gr * (b - a), x2 = a + gr * (b - a);
      let f1 = fitAll(list, x1).chi, f2 = fitAll(list, x2).chi;
      for (let k = 0; k < 22; k++) {
        if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - gr * (b - a); f1 = fitAll(list, x1).chi; }
        else { a = x1; x1 = x2; f1 = f2; x2 = a + gr * (b - a); f2 = fitAll(list, x2).chi; }
      }
      const pi = 0.5 * (a + b);
      return { pi: pi, res: fitAll(list, pi) };
    };
    if (typeof process !== "undefined" && process.env && process.env.DDM_DEBUG_PI === "1") { const pr = [0, 0.02, 0.05, 0.08, 0.12, 0.2, 0.3].map(function (P) { items.forEach(function (it) { it.last = null; }); return P + ":" + fitAll(items, P).chi.toFixed(1); }); console.log("chi2 profile " + pr.join(" ") + " (" + items.length + " q)"); }
    const best = search(items);
    if (!best.res.fits) return null;
    const groups = [0, 1, 2, 3].map(function (g) { return items.filter(function (it, k) { return k % 4 === g; }); }).filter(function (gl) { return gl.length >= 2; });
    const gp = groups.map(function (gl) { return search(gl).pi; });
    const m = gp.reduce(function (x, y) { return x + y; }, 0) / gp.length;
    const sd = gp.length > 1 ? Math.sqrt(gp.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (gp.length - 1)) : null;
    let sw = 0, sx = 0;
    const okf = best.res.fits.filter(function (g) { return g.ok; });
    okf.forEach(function (g) { const w = 1 / (g.lnGamma_se * g.lnGamma_se + 1e-4); sw += w; sx += w * (Math.log(g.gamma_hz) - 2 * Math.log(g.q_per_um)); });
    let ss = 0; okf.forEach(function (g) { const w = 1 / (g.lnGamma_se * g.lnGamma_se + 1e-4), r = Math.log(g.gamma_hz) - 2 * Math.log(g.q_per_um) - sx / sw; ss += w * r * r; });
    return { pi: best.pi, pi_err: sd === null ? null : sd / Math.sqrt(gp.length), D_um2_s: Math.exp(sx / sw), rel_err: okf.length > 1 ? Math.sqrt(ss / ((okf.length - 1) * sw)) : null, n_points: okf.length };
  }
  /* Repeatability: the movie is cut into NB parts (4 from 256 frames on, otherwise 2); each part gets its own
   * structure function and fits at the q used for the full movie, and its own D. The spread of the parts gives the
   * repeatability; the uncertainty of the full-movie value is taken as SD / sqrt(NB). */
  function blockAnalysis(fft, T, P, binOf, nb, lags, taus, used, B_est, kind) {
    const NB = T >= 256 ? 4 : 2, Tb = Math.floor(T / NB);
    const bins = used.map(function (f) { return f.bin; }), want = new Int32Array(nb + 1).fill(-1);
    bins.forEach(function (b, k) { want[b] = k; });
    const lagIdx = []; for (let li = 0; li < lags.length; li++) if (lags[li] <= Tb / 2) lagIdx.push(li);
    if (lagIdx.length < 8 || used.length < 3) return null;
    const res = [], nU = used.length, cnt = new Float64Array(nU);
    // only the Fourier pixels of the used q (and only half of them: the transform of a real frame is symmetric)
    const pixL = [], uL = [];
    const n = Math.round(Math.sqrt(P));
    for (let p = 0; p < P; p++) { const b = binOf[p]; if (b > 0 && want[b] >= 0) { const iy = Math.floor(p / n); if (iy > n / 2 || (iy === 0)) continue; pixL.push(p); uL.push(want[b]); cnt[want[b]]++; } }
    const pix = Int32Array.from(pixL), uu = Int32Array.from(uL), NPX = pix.length;
    for (let k = 0; k < NB; k++) {
      const t0 = k * Tb;
      const dqb = lagIdx.map(function () { return new Float64Array(nU); });
      lagIdx.forEach(function (li, j) {
        const m = lags[li], acc = dqb[j]; let pairs = 0;
        for (let t = t0; t + m < t0 + Tb; t++) {
          const o1 = 2 * P * t, o2 = 2 * P * (t + m);
          for (let j = 0; j < NPX; j++) {
            const p2 = 2 * pix[j], dr = fft[o2 + p2] - fft[o1 + p2], di = fft[o2 + p2 + 1] - fft[o1 + p2 + 1];
            acc[uu[j]] += dr * dr + di * di;
          }
          pairs++;
        }
        for (let u = 0; u < nU; u++) acc[u] = acc[u] / pairs / P / cnt[u];
      });
      const vq = new Float64Array(nU);
      { const mr = new Float64Array(P), mi = new Float64Array(P), m2 = new Float64Array(P);
        for (let t = t0; t < t0 + Tb; t++) { const o = 2 * P * t; for (let j = 0; j < NPX; j++) { const p = pix[j], r = fft[o + 2 * p], i = fft[o + 2 * p + 1]; mr[p] += r; mi[p] += i; m2[p] += r * r + i * i; } }
        for (let j = 0; j < NPX; j++) { const p = pix[j]; vq[uu[j]] += (m2[p] / Tb - (mr[p] * mr[p] + mi[p] * mi[p]) / (Tb * Tb)) / P; }
        for (let u = 0; u < nU; u++) vq[u] /= cnt[u]; }
      const tb = lagIdx.map(function (li) { return taus[li]; }), gLo = 1 / tb[tb.length - 1], gHi = 1 / tb[0];
      const fitsK = [];
      used.forEach(function (f, u) {
        const y = Float64Array.from(dqb.map(function (a) { return a[u]; }));
        const g = fitOne(tb, y, vq[u], B_est[f.bin], kind, f.bin, f.q_per_um);
        if (g.ok && g.lnGamma_se <= MAX_LN_GAMMA_SE && g.gamma_hz > gLo && g.gamma_hz < gHi) fitsK.push(g);
      });
      const Dk = weightedD(fitsK);
      if (Dk) res.push(Dk.D_um2_s);
    }
    if (res.length < 2) return null;
    const mean = res.reduce(function (a, b) { return a + b; }, 0) / res.length;
    const sd = Math.sqrt(res.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (res.length - 1));
    return { method: kind, n_blocks: res.length, frames_per_block: Tb, D_um2_s: res, mean_D_um2_s: mean, rel_sd: sd / mean, rel_err_full: sd / mean / Math.sqrt(res.length) };
  }
  // weighted mean of ln(Gamma / q^2); uncertainty from the scatter of the points
  function weightedD(used) {
    if (used.length < 3) return null;
    let sw = 0, sx = 0;
    for (const f of used) { const wgt = 1 / (f.lnGamma_se * f.lnGamma_se + 1e-4); sw += wgt; sx += wgt * (Math.log(f.gamma_hz) - 2 * Math.log(f.q_per_um)); }
    const mean = sx / sw;
    let ss = 0;
    for (const f of used) { const wgt = 1 / (f.lnGamma_se * f.lnGamma_se + 1e-4); const r = Math.log(f.gamma_hz) - 2 * Math.log(f.q_per_um) - mean; ss += wgt * r * r; }
    const se = Math.sqrt(ss / ((used.length - 1) * sw));
    return { D_um2_s: Math.exp(mean), rel_err: se, n_points: used.length };
  }
  // free power law Gamma = c q^s (s = 2 for diffusion, s = 1 for steady motion)
  function powerLaw(used) {
    if (used.length < 3) return null;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const f of used) {
      const wgt = 1 / (f.lnGamma_se * f.lnGamma_se + 1e-4), X = Math.log(f.q_per_um), Y = Math.log(f.gamma_hz);
      sw += wgt; sx += wgt * X; sy += wgt * Y; sxx += wgt * X * X; sxy += wgt * X * Y;
    }
    const det = sw * sxx - sx * sx;
    if (!(det > 0)) return null;
    return { exponent: (sw * sxy - sx * sy) / det, prefactor: Math.exp((sxx * sy - sx * sxy) / det) };
  }

  // Levenberg-Marquardt on residual function resid(p) (array), optional clamp(p) after each step
  function lm(resid, p0, clamp) {
    const np = p0.length;
    const cost = function (r) { let s = 0; for (let i = 0; i < r.length; i++) s += r[i] * r[i]; return s; };
    let p = p0.slice(), r = resid(p), c = cost(r), lambda = 1e-3, J = null;
    const L = r.length;
    for (let it = 0; it < 200; it++) {
      J = [];
      for (let k = 0; k < np; k++) {
        const hh = 1e-6 * Math.max(1, Math.abs(p[k]));
        const pp = p.slice(); pp[k] += hh;
        const r2 = resid(pp); const col = new Float64Array(L);
        for (let i = 0; i < L; i++) col[i] = (r2[i] - r[i]) / hh;
        J.push(col);
      }
      const JTJ = [], JTr = [];
      for (let a = 0; a < np; a++) {
        JTJ.push(new Float64Array(np));
        let s = 0; for (let i = 0; i < L; i++) s += J[a][i] * r[i]; JTr.push(s);
        for (let bb = 0; bb < np; bb++) { let t = 0; for (let i = 0; i < L; i++) t += J[a][i] * J[bb][i]; JTJ[a][bb] = t; }
      }
      let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const Mx = JTJ.map(function (row, a) { const rr = Float64Array.from(row); rr[a] *= (1 + lambda); rr[a] += 1e-12; return rr; });
        const delta = solve(Mx, JTr.map(function (v) { return -v; }));
        if (delta === null) { lambda *= 10; continue; }
        let pn = p.slice(); for (let k = 0; k < np; k++) pn[k] += delta[k];
        if (clamp) pn = clamp(pn);
        const rn = resid(pn), cn = cost(rn);
        if (cn < c) { const rel = (c - cn) / c; p = pn; r = rn; c = cn; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-10) it = 1e9; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    // covariance (times residual variance) from the final Jacobian
    let cov = null;
    const dof = L - np;
    if (J !== null && dof > 0) {
      const JTJ = [];
      for (let a = 0; a < np; a++) { JTJ.push(new Float64Array(np)); for (let bb = 0; bb < np; bb++) { let t = 0; for (let i = 0; i < L; i++) t += J[a][i] * J[bb][i]; JTJ[a][bb] = t; } }
      const inv = invert(JTJ);
      if (inv !== null) cov = inv.map(function (row) { return row.map(function (v) { return v * c / dof; }); });
    }
    return { p: p, cost: c, cov: cov };
  }

  /* Two modes for one q, starting from the one-mode fit f1:
   *   d = A (1 - a exp(-G1 dt) - (1 - a) exp(-G2 dt)) + B,  G2 = G1 + Delta > G1.
   * Kept only when clearly better than one mode (F statistic above 10), both amplitudes at least 3 %,
   * G2 at least 1.5 G1 and both rates known to better than about 30 %; otherwise the one-mode fit is returned. */
  function fitTwo(taus, y, f1) {
    const L = taus.length, out = Object.assign({}, f1, { two: false, gamma2_hz: null, lnGamma2_se: null, frac_slow: 1 });
    if (!f1.ok) return out;
    const scale = f1.A + Math.abs(f1.B) + 1e-30;
    const model = function (pp, t) {
      const A = Math.exp(pp[0]), B = pp[1] * scale, G1 = Math.exp(pp[2]), G2 = G1 + Math.exp(pp[3]), aa = 1 / (1 + Math.exp(-pp[4]));
      return A * (1 - aa * Math.exp(-G1 * t) - (1 - aa) * Math.exp(-G2 * t)) + B;
    };
    const resid = function (pp) { const r = new Float64Array(L); for (let i = 0; i < L; i++) r[i] = (model(pp, taus[i]) - y[i]) / scale; return r; };
    const clamp = function (pp) { pp[4] = Math.max(-8, Math.min(8, pp[4])); pp[2] = Math.max(-30, Math.min(30, pp[2])); pp[3] = Math.max(-30, Math.min(30, pp[3])); return pp; };
    let c1 = 0; for (let i = 0; i < L; i++) { const v = (f1.model(taus[i]) - y[i]) / scale; c1 += v * v; }
    const G = f1.gamma_hz;
    let best = null;
    for (const st of [[0.5, 4, 0], [1, 20, 0], [0.2, 2, 0], [0.05, 1, 0], [0.5, 4, 1.5], [0.5, 4, -1.5], [1, 100, 1]]) {
      const fit = lm(resid, [Math.log(f1.A), f1.B / scale, Math.log(G * st[0]), Math.log(G * st[1]), st[2]], clamp);
      if (best === null || fit.cost < best.cost) best = fit;
    }
    const p = best.p, c2 = best.cost, dof = L - 5;
    if (!(dof > 0) || best.cov === null) return out;
    const Fstat = ((c1 - c2) / 2) / (c2 / dof + 1e-300);
    const G1 = Math.exp(p[2]), Dl = Math.exp(p[3]), G2 = G1 + Dl, aa = 1 / (1 + Math.exp(-p[4]));
    const v11 = best.cov[2][2], v22 = best.cov[3][3], v12 = best.cov[2][3];
    const se1 = v11 > 0 ? Math.sqrt(v11) : Infinity;
    const var2 = (G1 * G1 * v11 + 2 * G1 * Dl * v12 + Dl * Dl * v22) / (G2 * G2);
    const se2 = var2 > 0 ? Math.sqrt(var2) : Infinity;
    if (!(Fstat > 10 && aa >= 0.03 && aa <= 0.97 && G2 >= 1.5 * G1 && se1 < 0.3 && se2 < 0.3)) return out;
    return Object.assign(out, {
      A: Math.exp(p[0]), B: p[1] * scale, gamma_hz: G1, lnGamma_se: se1, two: true, gamma2_hz: G2, lnGamma2_se: se2, frac_slow: aa,
      model: function (t) { return model(p, t); }
    });
  }

  /* Rotational diffusion from the fast mode: 6 D_R = Gamma_2 - D_T q^2, weighted mean over the q where the
   * fast mode is measurable; without D_T, a straight line Gamma_2 = D q^2 + 6 D_R. */
  function rotation(rows, D, q_lo, q_hi, g_lo, g_hi) {
    const pts = rows.filter(function (f) {
      return f.two && f.ok && f.q_per_um >= 2 * q_lo && f.q_per_um <= q_hi && f.gamma2_hz > g_lo && f.gamma2_hz < g_hi && f.lnGamma2_se < 0.3 && f.frac_slow <= 0.97;
    });
    if (pts.length < 3) return null;
    let R, se;
    if (D !== null) {
      let sw = 0, sx = 0;
      // weights from the relative errors only: weighting by the absolute error (Gamma x relative error) favours the
      // points that came out low and biases the mean downwards
      const val = pts.map(function (f) { const v = f.gamma2_hz - D.D_um2_s * f.q_per_um * f.q_per_um; return { v: v, w: 1 / (f.lnGamma2_se * f.lnGamma2_se + 1e-4) }; });
      val.forEach(function (o) { sw += o.w; sx += o.w * o.v; });
      R = sx / sw;
      let ss = 0; val.forEach(function (o) { ss += o.w * (o.v - R) * (o.v - R); });
      se = Math.sqrt(ss / ((val.length - 1) * sw));
    } else {
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      pts.forEach(function (f) { const w = 1 / (f.lnGamma2_se * f.lnGamma2_se + 1e-4), X = f.q_per_um * f.q_per_um, Y = f.gamma2_hz; sw += w; sx += w * X; sy += w * Y; sxx += w * X * X; sxy += w * X * Y; });
      const det = sw * sxx - sx * sx; if (!(det > 0)) return null;
      R = (sxx * sy - sx * sxy) / det;
      const slope = (sw * sxy - sx * sy) / det;
      let ss = 0; pts.forEach(function (f) { const w = 1 / (f.lnGamma2_se * f.lnGamma2_se + 1e-4), r = f.gamma2_hz - R - slope * f.q_per_um * f.q_per_um; ss += w * r * r; });
      se = Math.sqrt(ss / (pts.length - 2) * sxx / det);
    }
    if (!(R > 0)) return { D_r_s: null, n_points: pts.length, reason: "the fast mode is not faster than translation" };
    return { D_r_s: R / 6, rel_err: se / R, n_points: pts.length, rate_s: R, used_bins: pts.map(function (f) { return f.bin; }) };
  }

  /* Global two-mode fit (as in the p-DDM and dark-field DDM papers): for every q
   *   d(q, dt) = c0(q) - c1(q) exp(-D_T q^2 dt) - c2(q) exp(-(D_T q^2 + 6 D_R) dt),   c1, c2 >= 0,
   * with c0 = A + B, c1 = A a, c2 = A (1 - a). For fixed D_T and D_R the c's are linear least squares, so only
   * two parameters are searched (grid, then Nelder-Mead in ln D_T, ln 6 D_R). Residuals relative to A + B per q.
   * Uncertainties from the curvature of the total misfit (they ignore correlations between q). */
  /* three = true adds the next orientation mode, exp(-(D_T q^2 + 20 D_R) dt), with the same D_R: signals that are
   * quadratic in the scattered field (crossed polarizers, dark field) carry it, and two modes then merge the
   * 6 D_R and 20 D_R decays into one rate in between. */
  function globalTwo(taus, dq, set, D0, R0, g_lo, g_hi, three) {
    if (set.length < 4) return null;
    const L = taus.length, NC = three ? 4 : 3;
    const Y = set.map(function (f) { const y = new Float64Array(L); for (let i = 0; i < L; i++) y[i] = dq[i][f.bin]; return y; });
    const S = set.map(function (f) { return Math.max(1e-30, f.A + Math.abs(f.B)); });
    const E = [null, new Float64Array(L), new Float64Array(L), new Float64Array(L)], cOut = [];
    const keeps = []; for (let m = 0; m < (1 << (NC - 1)); m++) { const k = [1]; for (let j = 0; j < NC - 1; j++) k.push((m >> j) & 1); keeps.push(k); }
    function lsq(y, sc, keep) {   // minimise |y - c0 + sum c_j e_j|^2 over the kept columns, returns [cost, c0, c1, c2, c3]
      const idx = []; for (let k = 0; k < NC; k++) if (keep[k]) idx.push(k);
      const col = function (k, i) { return k === 0 ? 1 : -E[k][i]; };
      const n = idx.length, M = [], v = [];
      for (let a = 0; a < n; a++) { M.push(new Float64Array(n)); let t = 0; for (let i = 0; i < L; i++) t += col(idx[a], i) * y[i]; v.push(t); for (let bb = 0; bb < n; bb++) { let u = 0; for (let i = 0; i < L; i++) u += col(idx[a], i) * col(idx[bb], i); M[a][bb] = u + (a === bb ? 1e-12 : 0); } }
      const x = solve(M, v); if (x === null) return null;
      const c = [0, 0, 0, 0]; for (let j = 0; j < n; j++) c[idx[j]] = x[j];
      let cost = 0; for (let i = 0; i < L; i++) { let m = c[0]; for (let k = 1; k < NC; k++) m -= c[k] * E[k][i]; const r = (y[i] - m) / sc; cost += r * r; }
      return [cost, c[0], c[1], c[2], c[3]];
    }
    function total(lnD, lnR, store) {
      const Dt = Math.exp(lnD), Rr = Math.exp(lnR);
      let tot = 0;
      for (let k = 0; k < set.length; k++) {
        const q2 = set[k].q_per_um * set[k].q_per_um;
        for (let i = 0; i < L; i++) { E[1][i] = Math.exp(-Dt * q2 * taus[i]); E[2][i] = Math.exp(-(Dt * q2 + Rr) * taus[i]); if (three) E[3][i] = Math.exp(-(Dt * q2 + Rr * 10 / 3) * taus[i]); }
        let best = null;
        for (const keep of keeps) {
          const r = lsq(Y[k], S[k], keep);
          if (r === null || r[2] < 0 || r[3] < 0 || r[4] < 0) continue;
          if (best === null || r[0] < best[0]) best = r;
        }
        if (best === null) return Infinity;
        tot += best[0];
        if (store) cOut[k] = best;
      }
      return tot;
    }
    let lnD = Math.log(D0 !== null ? D0 : set[Math.floor(set.length / 2)].gamma_hz / Math.pow(set[Math.floor(set.length / 2)].q_per_um, 2));
    // coarse search over the rotation rate inside the measurable window, then both parameters
    let lnR = R0 !== null && R0 > 0 ? Math.log(R0) : null, bestC = Infinity;
    for (let j = 0; j <= 24; j++) {
      const lr = Math.log(g_lo) + (Math.log(g_hi) - Math.log(g_lo)) * j / 24, c = total(lnD, lr, false);
      if (c < bestC) { bestC = c; lnR = lr; }
    }
    if (R0 !== null && R0 > 0) { const c = total(lnD, Math.log(R0), false); if (c < bestC) { bestC = c; lnR = Math.log(R0); } }
    // Nelder-Mead in 2D
    let simplex = [[lnD, lnR], [lnD + 0.1, lnR], [lnD, lnR + 0.3]].map(function (p) { return { p: p, c: total(p[0], p[1], false) }; });
    for (let it = 0; it < 200; it++) {
      simplex.sort(function (a, b) { return a.c - b.c; });
      const [b0, b1, w] = simplex;
      if (Math.abs(w.c - b0.c) <= 1e-10 * (1 + b0.c) && Math.hypot(w.p[0] - b0.p[0], w.p[1] - b0.p[1]) < 1e-6) break;
      const cx = [(b0.p[0] + b1.p[0]) / 2, (b0.p[1] + b1.p[1]) / 2];
      const at = function (t) { const p = [cx[0] + t * (w.p[0] - cx[0]), cx[1] + t * (w.p[1] - cx[1])]; return { p: p, c: total(p[0], p[1], false) }; };
      const r = at(-1);
      if (r.c < b0.c) { const e = at(-2); simplex[2] = e.c < r.c ? e : r; }
      else if (r.c < b1.c) simplex[2] = r;
      else { const k = at(r.c < w.c ? -0.5 : 0.5); if (k.c < Math.min(r.c, w.c)) simplex[2] = k; else { simplex[1] = { p: [(b0.p[0] + b1.p[0]) / 2, (b0.p[1] + b1.p[1]) / 2], c: 0 }; simplex[1].c = total(simplex[1].p[0], simplex[1].p[1], false); simplex[2] = { p: [(b0.p[0] + w.p[0]) / 2, (b0.p[1] + w.p[1]) / 2], c: 0 }; simplex[2].c = total(simplex[2].p[0], simplex[2].p[1], false); } }
    }
    simplex.sort(function (a, b) { return a.c - b.c; });
    lnD = simplex[0].p[0]; lnR = simplex[0].p[1];
    // one shared diffusion mode for comparison (golden-section search in ln D)
    const one = function (lnd) { return total(lnd, Math.log(g_hi) + 20, false); };   // fast mode decayed at every lag: only c0, c1 matter
    let lo1 = lnD - 1.5, hi1 = lnD + 1.5;
    for (let it = 0; it < 60; it++) { const m1 = hi1 - 0.618 * (hi1 - lo1), m2 = lo1 + 0.618 * (hi1 - lo1); if (one(m1) < one(m2)) hi1 = m2; else lo1 = m1; }
    const cOne = one((lo1 + hi1) / 2);
    const cmin = total(lnD, lnR, true);
    // amplitude of the fast mode, and curvature of the misfit
    let a1 = 0, a2 = 0, a3 = 0; cOut.forEach(function (c) { a1 += c[2]; a2 += c[3]; a3 += c[4]; });
    const fastShare = (a2 + a3) / (a1 + a2 + a3 + 1e-300), l4Share = a3 / (a2 + a3 + 1e-300);
    const hD = 0.02, hR = 0.05;
    const fpp = function (dx, dy) { return total(lnD + dx, lnR + dy, false); };
    const Hdd = (fpp(hD, 0) - 2 * cmin + fpp(-hD, 0)) / (hD * hD), Hrr = (fpp(0, hR) - 2 * cmin + fpp(0, -hR)) / (hR * hR);
    const Hdr = (fpp(hD, hR) - fpp(hD, -hR) - fpp(-hD, hR) + fpp(-hD, -hR)) / (4 * hD * hR);
    const dof = Math.max(1, set.length * (L - 3) - 2), s2 = cmin / dof, det = Hdd * Hrr - Hdr * Hdr;
    let seD = null, seR = null;
    if (det > 0 && Hdd > 0 && Hrr > 0) { seD = Math.sqrt(2 * s2 * Hrr / det); seR = Math.sqrt(2 * s2 * Hdd / det); }
    // per q: share of the fast mode (for the plots)
    set.forEach(function (f, k) { const c = cOut[k]; f.global_fast_share = c ? (c[3] + c[4]) / (c[2] + c[3] + c[4] + 1e-300) : null; });
    const Dres = seD === null ? null : { D_um2_s: Math.exp(lnD), rel_err: seD, n_points: set.length, global: true };
    const edge = lnR <= Math.log(g_lo) + 0.05 || lnR >= Math.log(g_hi) - 0.05;
    const gain = (cOne - cmin) / (cOne + 1e-300);
    let rotRes;
    if (DEBUG_TWO) console.log("global two-mode: misfit one mode " + cOne.toExponential(3) + ", two modes " + cmin.toExponential(3) + ", gain " + gain.toFixed(3) + ", fast share " + fastShare.toFixed(3));
    // a second mode must remove most of the misfit of one shared diffusion mode: tests gave 0.9-0.96 with
    // rotating particles and about 0.3 for spheres (axial motion and noise also bend the curves a little)
    if (fastShare < 0.02 || gain < 0.6) rotRes = { D_r_s: null, n_points: set.length, fast_share: fastShare, gain: gain, reason: "no clear rotational signal" };
    else if (edge) rotRes = { D_r_s: null, n_points: set.length, fast_share: fastShare, reason: "the rotation is outside the measurable range of rates" };
    else rotRes = { D_r_s: Math.exp(lnR) / 6, rel_err: seR, n_points: set.length, rate_s: Math.exp(lnR), fast_share: fastShare, global: true };
    if (rotRes.D_r_s !== undefined && rotRes.D_r_s !== null) { rotRes.gain = gain; rotRes.modes = three ? 3 : 2; rotRes.l4_share = three ? l4Share : 0; }
    return { D: rotRes.D_r_s === null ? null : Dres, rot: rotRes, misfit: cmin, misfit_one: cOne };
  }

  // Levenberg-Marquardt fit of d(dt) = A (1 - exp(-(Gamma dt)^beta)) + B for one q
  /* kind: "simple" exp(-G t); "stretched" exp(-(G t)^beta); "schulz": decay rates spread as a Schulz (gamma)
   * distribution of mean G and polydispersity index PI = var / G^2, whose average is exactly
   * (1 + PI G t)^(-1 / PI) (tends to the simple exponential as PI -> 0) */
  // opt (optional): { pi: fixed PI for the Schulz form (3 free parameters), start: { A, B, G } first guesses }
  function fitOne(taus, y, varq, B_guess, kind, bin, q, opt) {
    const stretched = kind === "stretched", schulz = kind === "schulz", fixPI = schulz && opt && opt.pi !== undefined ? opt.pi : null;
    const L = taus.length;
    for (let i = 1; i < L; i++) need(taus[i] > taus[i - 1], "lag times must increase strictly");
    // first guesses (as in fastddm.noise_est + tutorial 1, section 2.A)
    need(Number.isFinite(B_guess), "noise estimate missing");
    const B0 = B_guess;
    let A0 = 2 * varq - B0;
    if (!(A0 > 0)) A0 = Math.max(y[L - 1] - B0, 1e-12);
    let tau1e = null;
    for (let i = 0; i < L; i++) { const f = 1 - (y[i] - B0) / A0; if (f < Math.exp(-1)) { tau1e = taus[i]; break; } }
    let G0 = tau1e === null ? 0.5 / taus[L - 1] : (tau1e === taus[0] ? 2 / taus[0] : 1 / tau1e);
    if (opt && opt.start) { A0 = opt.start.A; G0 = opt.start.G; }

    const scale = A0 + B0;
    // parameters: ln A, B / scale, ln Gamma, beta  (B linear: it may legitimately be near zero)
    // Schulz: PI enters linearly and may go below 0 (the same form continued: f = max(0, 1 + PI G t)^(-1/PI)), so that
    // noise does not push the estimate up against a bound at 0; only PI >= 0 is a real spread of rates
    let p = [Math.log(A0), (opt && opt.start ? opt.start.B : B0) / scale, Math.log(G0), schulz ? 0.02 : 1];
    const np = (stretched || schulz) && fixPI === null ? 4 : 3;
    const model = function (pp, t) {
      const A = Math.exp(pp[0]), B = pp[1] * scale, G = Math.exp(pp[2]);
      if (schulz) { const PI = fixPI !== null ? fixPI : pp[3]; return Math.abs(PI) < 1e-6 ? A * (1 - Math.exp(-G * t)) + B : A * (1 - Math.pow(Math.max(0, 1 + PI * G * t), -1 / PI)) + B; }
      const be = stretched ? pp[3] : 1;
      return A * (1 - Math.exp(-Math.pow(G * t, be))) + B;
    };
    const resid = function (pp) { const r = new Float64Array(L); for (let i = 0; i < L; i++) r[i] = (model(pp, taus[i]) - y[i]) / scale; return r; };
    const cost = function (r) { let s = 0; for (let i = 0; i < L; i++) s += r[i] * r[i]; return s; };
    let r = resid(p), c = cost(r), lambda = 1e-3, J = null;
    for (let it = 0; it < 200; it++) {
      J = [];
      for (let k = 0; k < np; k++) {
        const h = 1e-6 * Math.max(1, Math.abs(p[k]));
        const pp = p.slice(); pp[k] += h;
        const r2 = resid(pp); const col = new Float64Array(L);
        for (let i = 0; i < L; i++) col[i] = (r2[i] - r[i]) / h;
        J.push(col);
      }
      const JTJ = [], JTr = [];
      for (let a = 0; a < np; a++) {
        JTJ.push(new Float64Array(np));
        let s = 0; for (let i = 0; i < L; i++) s += J[a][i] * r[i]; JTr.push(s);
        for (let bb = 0; bb < np; bb++) { let t = 0; for (let i = 0; i < L; i++) t += J[a][i] * J[bb][i]; JTJ[a][bb] = t; }
      }
      let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const M = JTJ.map(function (row, a) { const rr = Float64Array.from(row); rr[a] *= (1 + lambda); return rr; });
        const delta = solve(M, JTr.map(function (v) { return -v; }));
        if (delta === null) { lambda *= 10; continue; }
        const pn = p.slice(); for (let k = 0; k < np; k++) pn[k] += delta[k];
        if (stretched) pn[3] = Math.min(2, Math.max(0.2, pn[3]));
        if (schulz && fixPI === null) pn[3] = Math.min(2, Math.max(-0.3, pn[3]));
        const rn = resid(pn), cn = cost(rn);
        if (cn < c) { const rel = (c - cn) / c; p = pn; r = rn; c = cn; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-10) it = 1e9; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    // standard error of ln Gamma from the curvature, residual variance as noise estimate
    let lnG_se = Infinity;
    const dof = L - np;
    if (J !== null && dof > 0) {
      const JTJ = [];
      for (let a = 0; a < np; a++) { JTJ.push(new Float64Array(np)); for (let bb = 0; bb < np; bb++) { let t = 0; for (let i = 0; i < L; i++) t += J[a][i] * J[bb][i]; JTJ[a][bb] = t; } }
      const inv = invert(JTJ);
      if (inv !== null && inv[2][2] > 0) lnG_se = Math.sqrt(inv[2][2] * c / dof);
    }
    const ok = Number.isFinite(p[2]) && Number.isFinite(lnG_se) && Number.isFinite(c);
    return {
      bin: bin, q_per_um: q, ok: ok,
      A: Math.exp(p[0]), B: p[1] * scale, gamma_hz: Math.exp(p[2]), beta: stretched ? p[3] : 1, pi: schulz ? (fixPI !== null ? fixPI : p[3]) : null, cost: c, dof: dof,
      lnGamma_se: lnG_se, model: function (t) { return model(p, t); }
    };
  }
  function solve(M, v) {                       // Gauss elimination with partial pivoting
    const n = v.length, A = M.map(function (r) { return Float64Array.from(r); }), b = Float64Array.from(v);
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (!(Math.abs(A[piv][c]) > 1e-300)) return null;
      let t = A[c]; A[c] = A[piv]; A[piv] = t; let tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
    return x;
  }
  function invert(M) {
    const n = M.length, out = [];
    for (let c = 0; c < n; c++) { const e = new Float64Array(n); e[c] = 1; const x = solve(M, e); if (x === null) return null; out.push(x); }
    const inv = []; for (let r = 0; r < n; r++) { inv.push(new Float64Array(n)); for (let c = 0; c < n; c++) inv[r][c] = out[c][r]; }
    return inv;
  }

  // structure function at one lag for the map, from the stored FFTs (any lag, not only the fitted ones)
  function structureMap(movie, lag) {
    const n = movie.n, T = movie.T, P = n * n, fft = movie.fft;
    need(lag >= 1 && lag < T, "lag out of range");
    const acc = new Float64Array(P); let count = 0;
    for (let t = 0; t + lag < T; t++) {
      const o1 = 2 * P * t, o2 = 2 * P * (t + lag);
      for (let p = 0; p < P; p++) { const dr = fft[o2 + 2 * p] - fft[o1 + 2 * p], di = fft[o2 + 2 * p + 1] - fft[o1 + 2 * p + 1]; acc[p] += dr * dr + di * di; }
      count++;
    }
    for (let p = 0; p < P; p++) acc[p] /= count * P;
    return acc;
  }

  function runToEnd(gen, onProgress) {         // for tests (synchronous)
    let r = gen.next();
    while (!r.done) { if (onProgress) onProgress(r.value); r = gen.next(); }
    return r.value;
  }

  const api = {
    CAMERA_PIXEL_UM: CAMERA_PIXEL_UM, WAVELENGTH_UM: WAVELENGTH_UM,
    waterViscosity_Pa_s: waterViscosity_Pa_s, diffusion_um2_s: diffusion_um2_s, diameterFromD_um: diameterFromD_um,
    simulate: simulate, analyse: analyse, structureMap: structureMap, runToEnd: runToEnd,
    // compact result of one analysis for repeated measurements: D from the main fit and the cumulants, the q used and the truth
    repeatSummary: function (r, mv) {
      return { main_D: r.D ? r.D.D_um2_s : null, cum_D: r.cumulants && r.cumulants.D_um2_s ? r.cumulants.D_um2_s : null, cum_pi: r.cumulants && r.cumulants.pi !== null && r.cumulants.pi !== undefined ? r.cumulants.pi : null, sch_pi: r.cumulants && r.cumulants.schulz_shared ? r.cumulants.schulz_shared.pi : null,
        qs: r.used.map(function (f) { return f.q_per_um; }), truth: mv.truth };
    },
    _test: { makeFftTables: makeFftTables, fft1d: fft1d, fitOne: fitOne, fitTwo: fitTwo, cumulants: cumulants, sharedSchulz: sharedSchulz, erf: erf, makeRng: makeRng }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DDM = api;
})(this);
