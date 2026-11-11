/* Movies of dilute particles in a cell on a Nikon Ti2-E, recorded with a camera or a point scanner.
 *
 * Particles diffuse in 3D (Stokes-Einstein; walls at the bottom and top of the cell reflect; optionally
 * gravity and the slower diffusion near the walls, see below). Each frame's Fourier transform is
 *   F(q) = sum_i K(q, z_i) exp(-i q . x_i)
 * with the optical kernel K from optics.js. K(q, z) = sum_m U_m(q) V_m(z) (low-rank split), so a
 * frame needs only M grids where each particle deposits V_m(z_i): Gaussian gridding on a grid
 * finer than the camera by a factor 2, FFT, deconvolution of the Gaussian, then the pixel
 * integration (cameras) and folding of everything above the pixel Nyquist frequency (aliasing).
 * Timing: each particle is imaged at the moment its row is exposed (rolling shutters, from the top or
 * from the centre outwards) or scanned (point scanners); with a global shutter all at once. This is
 * exact when a particle's image covers few rows compared with the frame.
 * The simulated field is periodic in x and y (no particles entering across the image edge).
 * Detectors: shot noise (Gaussian approximation of Poisson; for photomultipliers times an excess-noise factor),
 * read noise, full well; camera binning
 * sums b x b pixels (digitally: read noise x b, or in charge: read noise x 1). Digitisation is not modelled.
 */
(function (root) {
  "use strict";
  const O = (typeof module !== "undefined" && module.exports) ? require("./optics.js") : root.OPTICS;
  const TWO_PI = 2 * Math.PI;
  const KB = 1.380649e-23;
  function fail(msg) { throw new Error("Movie: " + msg); }
  function need(c, msg) { if (!c) fail(msg); }
  function num(o, k, lo, hi) { const v = o[k]; need(typeof v === "number" && Number.isFinite(v), "missing setting '" + k + "'"); need(v >= lo && v <= hi, "setting '" + k + "' = " + v + " outside [" + lo + ", " + hi + "]"); return v; }

  function makeRng(seed) {
    let a = seed >>> 0, spare = null;
    const u = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const g = function () { if (spare !== null) { const s = spare; spare = null; return s; } let x = 0; while (x === 0) x = u(); const y = u(), r = Math.sqrt(-2 * Math.log(x)); spare = r * Math.sin(TWO_PI * y); return r * Math.cos(TWO_PI * y); };
    return { u: u, g: g };
  }

  // low-rank split for complex, direction-dependent kernels: real depth basis V_m from the depth-depth
  // matrix sum over rows of (Kr Kr^T + Ki Ki^T); complex U_m(row) = K(row, .) . V_m
  // nodes and normalised weights of generalised Gauss-Laguerre quadrature (weight x^alpha e^-x), Golub-Welsch:
  // eigenvalues of the symmetric tridiagonal Jacobi matrix (diagonal 2i + alpha + 1, off-diagonal sqrt(i (i + alpha)))
  function gaussLaguerre(n, alpha) {
    const A = []; for (let i = 0; i < n; i++) { A.push(new Float64Array(n)); A[i][i] = 2 * i + alpha + 1; }
    for (let i = 1; i < n; i++) { const b = Math.sqrt(i * (i + alpha)); A[i][i - 1] = b; A[i - 1][i] = b; }
    const V = []; for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-24) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const idx = []; for (let i = 0; i < n; i++) idx.push(i); idx.sort(function (a, b) { return A[a][a] - A[b][b]; });
    const x = idx.map(function (i) { return A[i][i]; }), w = idx.map(function (i) { return V[0][i] * V[0][i]; });
    const W = w.reduce(function (a, b) { return a + b; }, 0);
    return { x: x, w: w.map(function (v) { return v / W; }) };
  }
  function lowRankComplex(Kr, Ki, rows, nz, tol, mmax) {
    const C = new Float64Array(nz * nz);
    for (let r = 0; r < rows; r++) { const o = r * nz; for (let a = 0; a < nz; a++) { const xr = Kr[o + a], xi = Ki[o + a]; if (xr === 0 && xi === 0) continue; for (let b = a; b < nz; b++) C[a * nz + b] += xr * Kr[o + b] + xi * Ki[o + b]; } }
    for (let a = 0; a < nz; a++) for (let b = 0; b < a; b++) C[a * nz + b] = C[b * nz + a];
    const V = new Float64Array(nz * nz); for (let i = 0; i < nz; i++) V[i * nz + i] = 1;
    let tr = 0; for (let i = 0; i < nz; i++) tr += C[i * nz + i];
    for (let sweep = 0; sweep < 40; sweep++) {
      let offd = 0; for (let a = 0; a < nz; a++) for (let b = a + 1; b < nz; b++) offd += C[a * nz + b] * C[a * nz + b];
      if (offd <= 1e-22 * tr * tr) break;
      for (let p = 0; p < nz; p++) for (let q = p + 1; q < nz; q++) {
        const apq = C[p * nz + q]; if (Math.abs(apq) <= 1e-300) continue;
        const th = (C[q * nz + q] - C[p * nz + p]) / (2 * apq), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < nz; k++) { const x = C[k * nz + p], y = C[k * nz + q]; C[k * nz + p] = c * x - s * y; C[k * nz + q] = s * x + c * y; }
        for (let k = 0; k < nz; k++) { const x = C[p * nz + k], y = C[q * nz + k]; C[p * nz + k] = c * x - s * y; C[q * nz + k] = s * x + c * y; }
        for (let k = 0; k < nz; k++) { const x = V[k * nz + p], y = V[k * nz + q]; V[k * nz + p] = c * x - s * y; V[k * nz + q] = s * x + c * y; }
      }
    }
    const ev = []; for (let i = 0; i < nz; i++) ev.push({ i: i, v: C[i * nz + i] });
    ev.sort(function (a, b) { return b.v - a.v; });
    const total = ev.reduce(function (s, e) { return s + Math.max(0, e.v); }, 0);
    need(total > 0, "kernel is zero");
    let kept = 0, M = 0;
    while (M < Math.min(mmax, nz)) { kept += Math.max(0, ev[M].v); M++; if (1 - kept / total < tol) break; }
    const U = [], UI = [], Vz = [];
    for (let m = 0; m < M; m++) {
      const col = ev[m].i, v = new Float64Array(nz), ur = new Float64Array(rows), ui = new Float64Array(rows);
      for (let a = 0; a < nz; a++) v[a] = V[a * nz + col];
      for (let r = 0; r < rows; r++) { let sr = 0, si = 0; const o = r * nz; for (let a = 0; a < nz; a++) { sr += Kr[o + a] * v[a]; si += Ki[o + a] * v[a]; } ur[r] = sr; ui[r] = si; }
      U.push(ur); UI.push(ui); Vz.push(v);
    }
    return { U: U, UI: UI, V: Vz, rank: M, residual: Math.max(0, 1 - kept / total) };
  }

  /* cfg (all required unless marked optional):
   *  seed, mode ("brightfield" | "fluorescence" | "spinning" | "scanning"),
   *  objective {mag, na}, illum {na_in, na_out}, pupil (optional), source (transmitted light),
   *  l_ex_um, l_em_um (fluorescence), pinhole_um (spinning disk: diameter on the disk), crosstalk (spinning disk: pinhole fill factor), pinhole_au (scanning),
   *  light_frac (transmitted light: background as a fraction of the binned full well),
   *  df_light_e, stray_frac (dark field; df_light_e also caps the lamp when an analyser dims the background),
   *  photons_per_particle, background_photons (camera fluorescence: arriving per exposure, per binned pixel),
   *  scan_rate_hz, background_photons (scanning: photon rate from a particle at the focus, per pixel per frame),
   *  detector: { kind: "camera", pixel_um, binning, bin_charge, qe, read_noise_e, full_well_e,
   *              timing: "global"|"rolling"|"rolling_center", t_row_s, rows_total, crop_row0 }
   *         or { kind: "scanner", pixel_um (at the sample), qe, dwell_s, passes, t_row_s (one line incl. passes), rows_total, crop_row0,
   *              excess_noise (optional, variance factor of the detector gain, default 1), resonant_fill (optional: fraction of the
   *              sine sweep used by a resonant mirror; pixels near the line ends then collect light longer) },
   *  n_px (simulated pixels per side, power of 2), n_frames, frame_rate_hz, exposure_s,
   *  particle (material key or {n}), diameter_um (largest dimension), size_spread (0..0.5, relative SD of the number
   *  distribution), size_distribution (optional: "lognormal" default, or "schulz"), volume_fraction,
   *  shape (optional: "sphere" default, "bisphere", "prolate", "oblate", "rod"), aspect (non-spheres), birefringence (optional, n_e - n_o),
   *  polarization (optional, transmitted light): { polarizer_deg: angle or null, analyzer_deg: angle or null, extinction },
   *  objective {mag, na, n_imm (optional immersion index; adds the aberration of focusing into the liquid)},
 *  vector (optional, default true; false = scalar optics, faster),
 *  liquid {glycerol_w} or {n, viscosity_mPa_s}, T_C, cell_um, focus_um (height of the focal plane above the bottom),
   *  drift_um_s, homodyne (transmitted light),
   *  gravity (optional, default false): sedimentation with the material and liquid densities,
   *  walls (optional, default false): particles keep their size away from the walls and diffuse more slowly near them
   *  swim (optional): self-propelled particles (swimming bacteria, active colloids)
   *    { fraction (0..1, share that swims), v_um_s (mean speed), v_spread (0..1, relative SD of a Schulz distribution
   *      of speeds), plane_fraction (0..1, share of the swimmers that swim along the bottom glass, axis parallel to it,
   *      at centre height height_um, or spread uniformly within +- height_spread_um of it, each keeping its height; the
   *      others swim in 3D), height_um (needed when plane_fraction > 0), height_spread_um (optional),
   *      rot_diff_s (optional: rotational diffusion of swimmers; default the passive value of the body),
   *      tumble_hz (optional: rate of tumbles, each a new random direction), circle_rad_s (optional: angular
   *      velocity of plane swimmers, positive counter-clockwise seen from the objective), plane_still (optional: the
   *      particles that do not swim also lie in the plane at height_um and move only within it) }
   *    Swimmers move along their axis (spheres carry a direction that does not change their image), keep their
   *    Brownian motion, are not slowed near the walls and bounce off them by mirroring the vertical part of their
   *    direction. Plane swimmers keep their height and turn only within the plane.
   */
  const SHAPES = ["sphere", "bisphere", "prolate", "oblate", "rod"];
  const TINY_UM = 0.03, TINY_M = 1.1;          // reference dipole for non-spherical bodies
  function* simulate(cfg) {
    const mode = cfg.mode;
    need(mode === "brightfield" || mode === "fluorescence" || mode === "spinning" || mode === "scanning", "unknown imaging mode " + mode);
    const confocal = mode === "spinning" || mode === "scanning", trans = mode === "brightfield";
    num(cfg, "seed", 0, 4294967295);
    const mag = num(cfg.objective, "mag", 1, 150), na = num(cfg.objective, "na", 0.02, 1.5);
    // immersion index (optional): with a liquid of another index, focusing hf into the cell adds spherical aberration
    const nImm = cfg.objective.n_imm === undefined ? null : num(cfg.objective, "n_imm", 1, 1.6);
    // vector optics (optional, default on): polarisation through the objective; scalar is faster and fine at low NA
    const scalar = cfg.vector === false;
    const det = cfg.detector; need(det && (det.kind === "camera" || det.kind === "scanner"), "detector missing");
    need((mode === "scanning") === (det.kind === "scanner"), "point scanning needs the scanner detector, the other modes a camera");
    const b = det.kind === "camera" ? num(det, "binning", 1, 4) : 1; need(b === 1 || b === 2 || b === 4, "binning must be 1, 2 or 4");
    const N = num(cfg, "n_px", 32, 256); need((N & (N - 1)) === 0, "simulated image size must be a power of two");
    const T = num(cfg, "n_frames", 16, 2048);
    need(N * N * T <= (1 << 23), "movie too large for the browser (pixels x frames above 8.4 million)");
    const fr = num(cfg, "frame_rate_hz", 0.01, 30000), expo = det.kind === "scanner" ? 0 : num(cfg, "exposure_s", 0, 10);
    need(expo <= 1 / fr * 1.0000001, "exposure longer than the frame interval");
    num(det, "qe", 0.01, 1); num(det, "t_row_s", 0, 1); num(det, "rows_total", 1, 20000); num(det, "crop_row0", 0, 20000);
    const timing = det.kind === "scanner" ? "scan" : det.timing;
    need(timing === "scan" || timing === "global" || timing === "rolling" || timing === "rolling_center", "unknown shutter timing");
    const readout = timing === "rolling_center" ? det.rows_total / 2 * det.t_row_s : timing === "global" ? 0 : det.rows_total * det.t_row_s;
    need(readout <= 1.001 / fr, "the " + (timing === "scan" ? "scan" : "read-out") + " of one frame takes longer than the frame interval");
    const d0 = num(cfg, "diameter_um", 0.01, 20), spread = num(cfg, "size_spread", 0, 0.5);
    const phi = num(cfg, "volume_fraction", 1e-9, 0.05);
    const T_C = num(cfg, "T_C", 0, 90), Lz = num(cfg, "cell_um", 1, 2000), hf = num(cfg, "focus_um", -50, 2050);
    const drift = num(cfg, "drift_um_s", 0, 1000);
    // swimmers (optional)
    const sw = cfg.swim || null;
    let swFrac = 0, swV = 0, swSpread = 0, swPlane = 0, swH = 0, swHs = 0, swDr = null, swTumble = 0, swOmega = 0;
    if (sw) {
      swFrac = num(sw, "fraction", 0, 1); swV = num(sw, "v_um_s", 0, 1000); swSpread = num(sw, "v_spread", 0, 1);
      swPlane = sw.plane_fraction === undefined ? 0 : num(sw, "plane_fraction", 0, 1);
      if (swPlane > 0) { swH = num(sw, "height_um", 0, 2000); swHs = sw.height_spread_um === undefined ? 0 : num(sw, "height_spread_um", 0, 2000); }
      if (sw.rot_diff_s !== undefined) swDr = num(sw, "rot_diff_s", 0, 1000);
      if (sw.tumble_hz !== undefined) swTumble = num(sw, "tumble_hz", 0, 1000);
      if (sw.circle_rad_s !== undefined) swOmega = num(sw, "circle_rad_s", -100, 100);
    }
    const a = det.kind === "camera" ? num(det, "pixel_um", 0.5, 30) * b / mag : num(det, "pixel_um", 0.005, 50);   // pixel at the sample (um)
    const L = N * a;                             // simulated field (um)
    const eta_mPa_s = cfg.liquid.viscosity_mPa_s !== undefined ? cfg.liquid.viscosity_mPa_s : O.viscosityWaterGlycerol_mPa_s(cfg.liquid.glycerol_w, T_C);
    const eta = eta_mPa_s * 1e-3, kT = KB * (T_C + 273.15);

    // particle shape, optical anisotropy and polarisers
    const shape = cfg.shape === undefined ? "sphere" : cfg.shape;
    need(SHAPES.indexOf(shape) >= 0, "unknown particle shape " + shape);
    const body = shape === "prolate" || shape === "oblate" || shape === "rod";   // filled with dipoles
    const oriented = shape !== "sphere";                                          // carries an axis that rotates
    const pAsp = body ? num(cfg, "aspect", 1, 30) : 1;
    const dn = shape === "sphere" || cfg.birefringence === undefined ? 0 : num(cfg, "birefringence", -0.5, 0.5);
    const pol = cfg.polarization || null;
    const hasP = !!pol && pol.polarizer_deg !== null && pol.polarizer_deg !== undefined, hasA = !!pol && pol.analyzer_deg !== null && pol.analyzer_deg !== undefined;
    if (hasP) num(pol, "polarizer_deg", -360, 360);
    if (hasA) { num(pol, "analyzer_deg", -360, 360); num(pol, "extinction", 0, 0.1); }
    const polarized = hasP || hasA;
    const isDic = trans && cfg.pupil && cfg.pupil.kind === "dic";
    need(!(isDic && (oriented || polarized)), "DIC is simulated only for isotropic spheres and without extra polarisers");
    need(!polarized || trans, "polarisers are simulated for transmitted light only");
    const split = trans && (oriented || polarized);   // interference and scattered intensity weighted per particle

    // size classes (polydisperse samples): 5 classes, number weights, mean diameter d0 and relative standard
    // deviation 'spread', from a lognormal (Gauss-Hermite nodes) or a Schulz distribution (Gauss-Laguerre nodes)
    const classes = [];
    const sdist = cfg.size_distribution === undefined ? "lognormal" : cfg.size_distribution;
    need(sdist === "lognormal" || sdist === "schulz", "size_distribution must be lognormal or schulz");
    if (spread > 0 && sdist === "schulz") {
      // p(d) ~ d^z exp(-(z + 1) d / d0), relative SD 1 / sqrt(z + 1); x = (z + 1) d / d0 has weight x^z e^-x
      const z = 1 / (spread * spread) - 1, Q = gaussLaguerre(5, z);
      for (let i = 0; i < 5; i++) classes.push({ d: d0 * Q.x[i] / (z + 1), w: Q.w[i] });
    } else if (spread > 0) {
      const s2 = Math.log(1 + spread * spread), s = Math.sqrt(s2), gx = [-2.0201828705, -0.9585724646, 0, 0.9585724646, 2.0201828705], gw = [0.0199532421, 0.3936193232, 0.9453087205, 0.3936193232, 0.0199532421];
      const W = gw.reduce(function (p, v) { return p + v; }, 0);
      for (let i = 0; i < 5; i++) classes.push({ d: d0 * Math.exp(Math.SQRT2 * s * gx[i] - s2 / 2), w: gw[i] / W });
    } else classes.push({ d: d0, w: 1 });
    classes.forEach(function (c) { c.geo = O.shapeGeometry(shape, c.d, pAsp); c.hyd = O.hydrodynamics(c.geo, kT, eta); });
    let meanVol = 0; classes.forEach(function (c) { meanVol += c.w * c.geo.volume; });
    const nTot = Math.round(phi / meanVol * L * L * Lz);
    need(nTot >= 1, "no particle in the simulated volume: raise the concentration");
    need(nTot <= 30000, "too many particles for the browser (" + nTot + "): lower the concentration, use a thinner cell or a smaller field");

    // optical cut-off and grid oversampling
    let qcut, lamRef;
    if (trans) {
      const spec = O.SOURCES[cfg.source].sample(); lamRef = spec.reduce(function (p, s) { return p + s.w * s.l; }, 0);
      const lmin = Math.min.apply(null, spec.map(function (s) { return s.l; }));
      need(cfg.illum && cfg.illum.na_out > 0, "illumination aperture missing");
      qcut = TWO_PI / lmin * (Math.min(na, 1.34) + Math.min(cfg.illum.na_out, 1.34));
      if (cfg.homodyne || split || cfg.illum.na_in > 0) qcut = Math.max(qcut, 2 * TWO_PI / lmin * Math.min(na, 1.34));
    } else {
      lamRef = cfg.l_em_um;
      qcut = confocal ? TWO_PI * Math.min(na, 1.34) * (1 / cfg.l_ex_um + 1 / cfg.l_em_um) * 1.0 : 2 * TWO_PI * Math.min(na, 1.34) / cfg.l_em_um;
    }
    // fine grid at half the camera pixel. Patterns finer than 0.75 of its Nyquist frequency
    // (1.5 x the camera's) are left out; with large pixels this drops part of their aliasing.
    const s = 2, G = N * s, h = a / s;
    const qKmax = Math.min(qcut * 1.02, 0.75 * Math.PI / h);
    const truncated = qcut * 1.02 > qKmax;
    const dqk = Math.min(TWO_PI / L / 2, qKmax / 96);
    const nq = Math.min(240, Math.ceil(qKmax / dqk) + 2);
    const qk = new Float64Array(nq); for (let i = 0; i < nq; i++) qk[i] = i * qKmax / (nq - 2);

    yield { stage: "Computing how one particle looks", frac: 0.02 };

    // kernels: blocks along z, stacked for one shared low-rank basis. Per class, channel -> block index.
    const ext = body ? Math.max.apply(null, classes.map(function (c) { return c.geo.a_par; })) : 0;
    const zlo = hf - Lz, zhi = hf;               // z along the light: particle at height H -> z = focus - H
    const abr = nImm === null ? null : { n_imm: nImm, depth_um: Math.max(0, hf) };
    const blocks = [], chans = classes.map(function () { return {}; });
    let Cext = null, dark = false;
    const lamC = lamRef, nLc = trans ? O.liquidIndex(cfg.liquid, lamC) : 1;
    const tKern = function (diam, particle, homOnly) {
      return O.transmittedKernel({ diameter_um: diam, particle: particle, liquid: cfg.liquid, na_obj: na, illum: cfg.illum, pupil: cfg.pupil || { kind: "none" }, source: cfg.source, q_per_um: qk, z_lo: zlo - 0.5 - ext, z_hi: zhi + 0.5 + ext, homodyne: homOnly ? false : (!split && cfg.homodyne), homodyne_only: !!homOnly, aberration: abr, scalar: scalar });
    };
    const push = function (Kr, Ki, nd, z) { blocks.push({ Kr: Kr, Ki: Ki, nd: nd, z_um: z }); return blocks.length - 1; };
    if (trans) need(typeof cfg.homodyne === "boolean", "say whether to include the scattered-intensity term");
    if (trans && !split) {
      for (let ci = 0; ci < classes.length; ci++) {
        const Tk = tKern(classes[ci].d, cfg.particle, false);
        if (Cext === null) Cext = Tk.Cext_um2; dark = Tk.dark;
        chans[ci].all = push(Tk.Kr, Tk.Ki, Tk.nd, Tk.z_um);
        yield { stage: "Computing how one particle looks", frac: 0.02 + 0.1 * (ci + 1) / classes.length };
      }
    } else if (trans && !body) {
      // spheres (birefringent or not) through polarisers: Mie field of the mean-index sphere times an orientation factor
      const nMat = O.particleIndex(cfg.particle, lamC);
      for (let ci = 0; ci < classes.length; ci++) {
        const c = classes[ci], V = c.geo.volume, mMean = (nMat + dn / 3) / nLc;
        let spec = typeof cfg.particle === "object" && cfg.particle.n !== undefined ? { n: cfg.particle.n + dn / 3 } : { base: cfg.particle, add: dn / 3 }, mRef = mMean;
        if (Math.abs(mMean - 1) < 0.01) { mRef = mMean >= 1 ? 1.01 : 0.99; spec = { n: nLc * mRef }; }   // near index matching: scale a weak sphere
        const aIso = O.polarizability(V, mMean, 1 / 3), dA = O.polarizability(V, (nMat + dn) / nLc, 1 / 3) - O.polarizability(V, nMat / nLc, 1 / 3);
        c.aPerp = aIso - dA / 3; c.dA = dA; c.aRef = O.polarizability(V, mRef, 1 / 3);
        const Th = tKern(c.d, spec, true); dark = Th.dark;
        chans[ci].hom = push(Th.Kr, Th.Ki, Th.nd, Th.z_um);
        if (!dark) { const Tt = tKern(c.d, spec, false); if (Cext === null) Cext = Tt.Cext_um2; chans[ci].het = push(Tt.Kr, Tt.Ki, Tt.nd, Tt.z_um); }
        yield { stage: "Computing how one particle looks", frac: 0.02 + 0.1 * (ci + 1) / classes.length };
      }
    } else if (trans) {
      // bodies: dipole kernels per unit polarisability, shared by all classes
      const spec = { n: nLc * TINY_M }, aT = O.polarizability(Math.PI * Math.pow(TINY_UM, 3) / 6, TINY_M, 1 / 3);
      const Th = tKern(TINY_UM, spec, true); dark = Th.dark;
      const sc2 = 1 / (aT * aT), hr = new Float64Array(Th.Kr.length); for (let i = 0; i < hr.length; i++) hr[i] = Th.Kr[i] * sc2;
      const iHom = push(hr, new Float64Array(hr.length), 1, Th.z_um);
      let iHet;
      if (!dark) { const Tt = tKern(TINY_UM, spec, false), r = new Float64Array(Tt.Kr.length); for (let i = 0; i < r.length; i++) r[i] = Tt.Kr[i] / aT; iHet = push(r, new Float64Array(r.length), 1, Tt.z_um); }
      const nMat = O.particleIndex(cfg.particle, lamC), Ld = O.depolarization(shape, pAsp);
      const sObj = Math.min(na, 0.999 * nLc) / nLc, sIn = Math.min(cfg.illum.na_in, 0.998 * nLc) / nLc, sOut = Math.min(cfg.illum.na_out, 0.999 * nLc) / nLc;
      for (let ci = 0; ci < classes.length; ci++) {
        const c = classes[ci], V = c.geo.volume;
        c.aPerp = O.polarizability(V, nMat / nLc, Ld[1]); c.dA = O.polarizability(V, (nMat + dn) / nLc, Ld[0]) - c.aPerp; c.aRef = 1;
        c.Wtab = O.brightnessTable(c.geo, TWO_PI * nLc / lamC, sObj, sIn, sOut, 17);
        chans[ci].hom = iHom; if (!dark) chans[ci].het = iHet;
      }
      yield { stage: "Computing how one particle looks", frac: 0.12 };
    } else {
      // fluorescence: dyed spheres, or bodies filled with point emitters (one shared point kernel)
      const lamz = cfg.l_em_um, naz = Math.min(na, 1.33), df = Math.min(0.25, 0.35 * lamz / (naz * naz)), Zf = Math.max(4, 40 * df);
      const zz = O.depthGrid(zlo - 0.5 - ext, zhi + 0.5 + ext, df, Zf, 0.06);
      need(zz.length <= 3000, "cell too thick for the fluorescence kernel");
      // pinhole projected on the sample: spinning disk through a 1x relay (assumed), scanner in Airy units
      const pin = mode === "spinning" ? num(cfg, "pinhole_um", 5, 200) / mag : mode === "scanning" ? num(cfg, "pinhole_au", 0.1, 10) * 1.22 * cfg.l_em_um / Math.min(na, 1.34) : 0;
      const fk = function (diam) { return O.fluorescenceKernel({ na_obj: na, liquid: cfg.liquid, l_ex: cfg.l_ex_um, l_em: cfg.l_em_um, diameter_um: diam, q_per_um: qk, z_um: zz, confocal: confocal, pinhole_um_sample: pin, crosstalk: mode === "spinning" ? num(cfg, "crosstalk", 0, 0.49) : 0, aberration: abr, scalar: scalar }).K; };
      if (body) { const K = fk(TINY_UM), ib = push(K, new Float64Array(K.length), 1, zz); classes.forEach(function (c, ci) { chans[ci].all = ib; }); }
      else for (let ci = 0; ci < classes.length; ci++) { const K = fk(classes[ci].d); chans[ci].all = push(K, new Float64Array(K.length), 1, zz); yield { stage: "Computing how one particle looks", frac: 0.02 + 0.1 * (ci + 1) / classes.length }; }
    }
    // bodies: points on a lattice finer than the finest pattern that matters (each point a dipole or emitter).
    // Interference (bright field): the scattering vector reaches qcut, so spacing 0.7 pi / qcut. Scattered
    // intensity alone (dark field) or fluorescence add incoherently: finer than the image band 2 k NA is enough
    // (the orientation dependence of the brightness is in Wtab).
    let ptsTotal = nTot;
    if (body) {
      const qPts = trans && dark ? 2 * TWO_PI / lamC * Math.min(na, 1.34) * 1.1 : qcut;
      classes.forEach(function (c) { c.pts = O.bodyPoints(c.geo, 0.7 * Math.PI / qPts, 64); });
      ptsTotal = 0; classes.forEach(function (c) { ptsTotal += c.w * nTot * c.pts.n; });
      need(ptsTotal <= 60000, "too many particles for the browser with these elongated particles: lower the concentration or use a smaller field");
    }
    let nzTot = 0; blocks.forEach(function (B) { B.off = nzTot; nzTot += B.z_um.length; });
    const nd = blocks[0].nd, rows = nd * nq;
    let maxI = 0, maxR = 0;
    blocks.forEach(function (K) { for (let i = 0; i < K.Kr.length; i++) { maxR = Math.max(maxR, Math.abs(K.Kr[i])); maxI = Math.max(maxI, Math.abs(K.Ki[i])); } });
    const complexK = nd > 1 || maxI > 1e-6 * maxR;
    const Kall = new Float64Array(rows * nzTot), KallI = complexK ? new Float64Array(rows * nzTot) : null;
    // each block is scaled to unit mean energy per depth before stacking, so that a weak channel (the scattered
    // intensity between crossed polarisers, say) is represented as well as a strong one; the weights undo the scale
    for (const B of blocks) {
      const nz = B.z_um.length;
      let e2 = 0; for (let i = 0; i < B.Kr.length; i++) e2 += B.Kr[i] * B.Kr[i] + B.Ki[i] * B.Ki[i];
      B.scale = e2 > 0 ? 1 / Math.sqrt(e2 / nz) : 1;
      for (let r = 0; r < rows; r++) for (let j = 0; j < nz; j++) { Kall[r * nzTot + B.off + j] = B.Kr[r * nz + j] * B.scale; if (complexK) KallI[r * nzTot + B.off + j] = B.Ki[r * nz + j] * B.scale; }
    }
    let LR;
    const RTOL = (typeof process !== "undefined" && process.env && process.env.DDM_RTOL) ? +process.env.DDM_RTOL : 1e-3;   // energy share left out; 1e-3 changes A(q) by under 1 % (checked) and saves 10-25 % of the time
    if (!complexK) LR = O.lowRank(Kall, nq, nzTot, RTOL, 32);          // thick cells need more terms
    else { need(nzTot <= 500, "DIC: the cell is too thick to simulate here (keep it below about 200 um)"); LR = lowRankComplex(Kall, KallI, rows, nzTot, RTOL, 32); }
    const M = LR.rank;
    yield { stage: "Computing how one particle looks", frac: 0.14 };

    // particles: position, height, axis (uniform on the sphere)
    const rng = makeRng(cfg.seed);
    const cls = new Uint8Array(nTot), X = new Float64Array(nTot), Y = new Float64Array(nTot), H = new Float64Array(nTot);
    const UX = new Float64Array(nTot), UY = new Float64Array(nTot), UZ = new Float64Array(nTot).fill(1);
    const cum = []; let acc = 0; classes.forEach(function (c) { acc += c.w; cum.push(acc); });
    const randomAxis = function (i) { const z = 2 * rng.u() - 1, ph = TWO_PI * rng.u(), r = Math.sqrt(1 - z * z); UX[i] = r * Math.cos(ph); UY[i] = r * Math.sin(ph); UZ[i] = z; };
    /* Walls and gravity. Walls: the particle keeps its smallest half-size a_ex from each wall, and translation is
     * hindered near a wall with the sphere results for the hydrodynamic radius a_h: parallel Faxen,
     * 1 - 9/16 x + 1/8 x^3 - 45/256 x^4 - 1/16 x^5 (x = a_h / height); perpendicular Bevan and Prieve (2000),
     * (6 g^2 + 2 a_h g) / (6 g^2 + 9 a_h g + 2 a_h^2) (g = gap); the two walls combine as 1/f = 1/f1 + 1/f2 - 1.
     * Rotation near walls is not hindered (approximation). Gravity: buoyant weight F = (rho_p - rho_l) V g gives the
     * drift D_z F / kT and the gravitational length kT / F; heights start from the equilibrium (barometric) profile. */
    const walls = cfg.walls === true, gravity = cfg.gravity === true;
    const rhoL = O.liquidDensity(cfg.liquid, T_C), rhoP = gravity ? O.particleDensity(cfg.particle) : rhoL;
    classes.forEach(function (c) {
      c.aex = walls ? Math.min(c.geo.a_par, c.geo.a_perp) : 0;
      c.ah = kT / (6 * Math.PI * eta * c.hyd.D_t * 1e-12) * 1e6;                         // hydrodynamic radius (um)
      const F = (rhoP - rhoL) * 1000 * c.geo.volume * 1e-18 * 9.81;                       // N, positive = sinks
      c.lg = gravity && Math.abs(F) > 0 ? kT / F * 1e6 : Infinity;                        // um, signed
      need(Lz > 2 * c.aex * 1.02, "the cell is thinner than the particles");
    });
    const fWall = function (c, h) {   // h = centre height above the bottom; returns [parallel, perpendicular] factors
      if (!walls) return [1, 1];
      const a = c.ah, one = function (hc) {
        const x = Math.min(1, a / Math.max(hc, 1e-6)), g = Math.max(hc - a, 0.01 * a);
        const fp = Math.max(0.05, 1 - 9 / 16 * x + x * x * x / 8 - 45 / 256 * x * x * x * x - x * x * x * x * x / 16);
        const fz = Math.max(0.02, (6 * g * g + 2 * a * g) / (6 * g * g + 9 * a * g + 2 * a * a));
        return [fp, fz];
      };
      const b = one(h), t = one(Lz - h);
      return [1 / (1 / b[0] + 1 / t[0] - 1), 1 / (1 / b[1] + 1 / t[1] - 1)];
    };
    const sampleHeight = function (c) {
      const lo = c.aex, W = Lz - 2 * c.aex, u = rng.u();
      if (!isFinite(c.lg) || Math.abs(c.lg) > 50 * W) return lo + u * W;
      const l = Math.abs(c.lg), y = -l * Math.log(1 - u * (1 - Math.exp(-W / l)));     // distance from the wall it settles on
      return c.lg > 0 ? lo + y : lo + W - y;
    };
    // wall slow-down averaged over the equilibrium heights of the middle size class, weighted by how close to the
    // focal plane they are (Gaussian of width lambda / NA^2, at least the particle size): what the image mostly sees
    const fParFocus = (function () {
      const c = classes[Math.floor(classes.length / 2)], lo = c.aex, W = Lz - 2 * c.aex, s = Math.max(lamRef / (na * na), 2 * c.ah), NI = 2000;
      let num = 0, den = 0;
      for (let k = 0; k < NI; k++) {
        const h = lo + W * (k + 0.5) / NI, pb = !isFinite(c.lg) ? 1 : c.lg > 0 ? Math.exp(-(h - lo) / c.lg) : Math.exp((lo + W - h) / c.lg), w = pb * Math.exp(-0.5 * (h - hf) * (h - hf) / (s * s));
        num += w * fWall(c, h)[0]; den += w;
      }
      return den > 0 ? num / den : 1;
    })();
    let fParMean = 0;
    for (let i = 0; i < nTot; i++) {
      const r = rng.u(); let c = 0; while (c < classes.length - 1 && r > cum[c]) c++;
      cls[i] = c; X[i] = rng.u() * L; Y[i] = rng.u() * L; H[i] = (walls || gravity) ? sampleHeight(classes[c]) : rng.u() * Lz;
      if (oriented) randomAxis(i);
      fParMean += fWall(classes[c], H[i])[0] / nTot;
    }
    // swimmers: speeds from a Schulz (gamma) distribution with mean swV and relative SD swSpread
    const SP = new Float64Array(nTot), PL = new Uint8Array(nTot);
    const gammaDraw = function (k) {      // Marsaglia and Tsang, mean k, for shape k >= 1 (k < 1 by the boost u^(1/k))
      const kk = k < 1 ? k + 1 : k, d = kk - 1 / 3, c3 = 1 / Math.sqrt(9 * d);
      let v;
      for (;;) { let x, w; do { x = rng.g(); w = 1 + c3 * x; } while (w <= 0); w = w * w * w; const u = rng.u(); if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - w + Math.log(w))) { v = d * w; break; } }
      return k < 1 ? v * Math.pow(rng.u(), 1 / k) : v;
    };
    const swList = [];
    const SW = new Uint8Array(nTot);     // moved by swimAdvance (swimmers, and particles kept in the plane)
    const stillPlane = sw && sw.plane_still === true;
    if (stillPlane) need(swPlane > 0, "plane_still needs plane swimmers (plane_fraction > 0)");
    if (sw) for (let i = 0; i < nTot; i++) {
      if (rng.u() >= swFrac) {
        if (stillPlane) { SW[i] = 1; PL[i] = 1; H[i] = Math.min(Lz - classes[cls[i]].aex, Math.max(classes[cls[i]].aex, swH)); const ph = TWO_PI * rng.u(); UX[i] = Math.cos(ph); UY[i] = Math.sin(ph); UZ[i] = 0; }
        continue;
      }
      SW[i] = 1;
      const k = swSpread > 0 ? 1 / (swSpread * swSpread) : 0;
      SP[i] = swSpread > 0 ? swV * gammaDraw(k) / k : swV;
      if (!(SP[i] > 0)) { SP[i] = 0; SW[i] = stillPlane ? 1 : 0; if (!stillPlane) continue; }
      if (swPlane > 0 && rng.u() < swPlane) {
        PL[i] = 1; H[i] = Math.min(Lz - classes[cls[i]].aex, Math.max(classes[cls[i]].aex, swH + swHs * (2 * rng.u() - 1)));
        const ph = TWO_PI * rng.u(); UX[i] = Math.cos(ph); UY[i] = Math.sin(ph); UZ[i] = 0;
      } else if (!oriented) randomAxis(i);
      swList.push(SP[i]);
    }
    let vMax = 0; for (let i = 0; i < nTot; i++) vMax = Math.max(vMax, SP[i]);
    // exposure blur: sub-steps when particles move or turn noticeably during the exposure
    // (D q^2 t_exp at the finest pattern imaged, 6 D_r t_exp); otherwise the exposure is treated as instantaneous
    let Dmax = 0, Drmax = 0; classes.forEach(function (c) { Dmax = Math.max(Dmax, c.hyd.D_par, c.hyd.D_perp); Drmax = Math.max(Drmax, c.hyd.D_r); });
    const blur = Math.max(Dmax * qcut * qcut * expo, oriented ? 6 * Drmax * expo : 0, Math.pow(vMax * qcut * expo, 2));
    const nsub = blur < 0.05 ? 1 : Math.min(8, Math.ceil(4 * Math.sqrt(blur)));
    const dtFrame = 1 / fr;

    // detector
    const qe = det.qe;
    let readE, fullWell, bgE, sigScale;
    if (det.kind === "camera") {
      num(det, "read_noise_e", 0, 100); num(det, "full_well_e", 10, 1e7);
      readE = det.bin_charge ? det.read_noise_e : det.read_noise_e * b;
      fullWell = det.bin_charge ? det.full_well_e : det.full_well_e * b * b;   // charge binning: full well assumed unchanged
    } else { readE = 0; fullWell = Infinity; }
    const bgf = polarized ? O.polCoeffs(pol, 0, 0, 0, 0).bg : 1;     // direct light passing the polarisers
    if (trans && dark) {
      // dark field: the kernel is relative to the incident light; df_light_e = electrons per pixel if all of it reached the camera
      const E0 = num(cfg, "df_light_e", 1, 1e12); bgE = E0 * num(cfg, "stray_frac", 0, 0.1); sigScale = E0;
    } else if (trans) {
      // the lamp is set so the background fills light_frac of the full well; an analyser can need more light than the lamp gives
      let E0 = num(cfg, "light_frac", 0.0005, 1) * fullWell / bgf;
      if (hasA) E0 = Math.min(E0, num(cfg, "df_light_e", 1, 1e12));
      bgE = E0 * bgf; sigScale = E0;
    }
    else if (det.kind === "camera") { bgE = qe * num(cfg, "background_photons", 0, 1e6); sigScale = qe * num(cfg, "photons_per_particle", 0.01, 1e9) * a * a; }
    else {
      // scanner: photons per pixel = rate x dwell x passes x qe x h(x) / h(0); h integrates to 1, so h(0) = 1 / A_eff
      const Kc = blocks[chans[Math.floor(classes.length / 2)].all], zc = Kc.z_um; let iz0 = 0;
      for (let j = 0; j < zc.length; j++) if (Math.abs(zc[j]) < Math.abs(zc[iz0])) iz0 = j;
      let hpk = 0; const nzc = zc.length, dq = qk[1] - qk[0];
      for (let iq = 0; iq < nq; iq++) hpk += Kc.Kr[iq * nzc + iz0] * qk[iq] * dq / TWO_PI;
      need(hpk > 0, "confocal spot could not be normalised");
      bgE = qe * num(cfg, "background_photons", 0, 1e6);
      sigScale = qe * num(cfg, "scan_rate_hz", 1, 1e10) * num(det, "dwell_s", 1e-10, 1e-2) * num(det, "passes", 1, 64) / hpk;
    }
    // per-column dwell of a resonant mirror: position x = sin(phase) sampled at equal steps in x, so the dwell goes as
    // 1 / cos(phase); normalised to a mean of 1 over the whole line (the mean dwell is dwell_s)
    const colGain = new Float64Array(N).fill(1);
    const enf = det.kind === "scanner" && det.excess_noise !== undefined ? num(det, "excess_noise", 1, 4) : 1;
    if (det.kind === "scanner" && det.resonant_fill !== undefined) {
      const f = num(det, "resonant_fill", 0.05, 0.98), sn = Math.sin(Math.PI * f / 2), mean = Math.asin(sn) / sn;
      for (let c = 0; c < N; c++) { const x = 2 * (det.crop_row0 + c + 0.5) / det.rows_total - 1; colGain[c] = 1 / (mean * Math.sqrt(1 - x * x * sn * sn)); }
    }

    // Gaussian gridding: sigma 0.8 grid units, 7 x 7 footprint (errors about 1e-3 up to 0.75 of the fine-grid Nyquist)
    const sig = 0.8, R = 3, tabN = 2 * R + 1;
    const ghat = new Float64Array(G);   // 1D transform of the gridding Gaussian (grid units)
    for (let k = 0; k < G; k++) { const kk = (k < G / 2 ? k : k - G) * TWO_PI / G; ghat[k] = Math.sqrt(TWO_PI) * sig * Math.exp(-0.5 * sig * sig * kk * kk); }
    const qx1 = new Float64Array(G); for (let k = 0; k < G; k++) qx1[k] = (k < G / 2 ? k : k - G) * TWO_PI / (G * h);
    // cameras integrate over the pixel; a point scanner samples
    const pix1 = new Float64Array(G); for (let k = 0; k < G; k++) { const u = qx1[k] * a / 2; pix1[k] = det.kind === "scanner" || Math.abs(u) < 1e-12 ? 1 : Math.sin(u) / u; }
    // per fine-grid frequency and basis function: U_m(q) x pixel factor / (gridding transform x a^2)
    // layout: spectra come out of fft2T transposed ([kx][ky]): index k1 is kx, k2 is ky.
    // Direction-dependent kernels (DIC) are tabulated for angles in [0, pi); the other half is the complex conjugate.
    const UW = [], UWI = []; for (let m = 0; m < M; m++) { UW.push(new Float32Array(G * G)); UWI.push(complexK ? new Float32Array(G * G) : null); }
    const active = [];
    for (let k1 = 0; k1 < G; k1++) for (let k2 = 0; k2 < G; k2++) {
      const qxv = qx1[k1], qyv = qx1[k2], qq = Math.hypot(qxv, qyv), t = qq / qKmax * (nq - 2), p = k1 * G + k2;
      if (t >= nq - 2) continue;
      const i = Math.floor(t), f = t - i, w = pix1[k1] * pix1[k2] / (ghat[k1] * ghat[k2]) / (a * a);
      if (!complexK) { for (let m = 0; m < M; m++) UW[m][p] = (LR.U[m][i] + f * (LR.U[m][i + 1] - LR.U[m][i])) * w; }
      else {
        let ang = Math.atan2(qyv, qxv), cj = false;
        if (ang < 0) { ang += Math.PI; cj = true; }
        if (ang >= Math.PI) { ang -= Math.PI; cj = !cj; }
        const ta = ang / (Math.PI / nd), d0i = Math.floor(ta) % nd, fa = ta - Math.floor(ta), d1 = (d0i + 1) % nd, wrap = d0i + 1 === nd;
        for (let m = 0; m < M; m++) {
          const Ur = LR.U[m], Ui = LR.UI[m];
          const at = function (d, ii) { return d * nq + ii; };
          const r0 = Ur[at(d0i, i)] + f * (Ur[at(d0i, i + 1)] - Ur[at(d0i, i)]), i0 = Ui[at(d0i, i)] + f * (Ui[at(d0i, i + 1)] - Ui[at(d0i, i)]);
          let r1 = Ur[at(d1, i)] + f * (Ur[at(d1, i + 1)] - Ur[at(d1, i)]), i1 = Ui[at(d1, i)] + f * (Ui[at(d1, i + 1)] - Ui[at(d1, i)]);
          if (wrap) i1 = -i1;                          // angle pi = angle 0 of -q: complex conjugate
          let vr = r0 + fa * (r1 - r0), vi = i0 + fa * (i1 - i0);
          if (cj) vi = -vi;
          UW[m][p] = vr * w; UWI[m][p] = vi * w;
        }
      }
      active.push(p);
    }
    const act = Int32Array.from(active), neg = new Int32Array(act.length), foldIdx = new Int32Array(act.length);
    const needRow = new Uint8Array(G); for (let k = 0; k < G; k++) needRow[k] = Math.abs(qx1[k]) <= qKmax ? 1 : 0;
    for (let j = 0; j < act.length; j++) {
      const p = act[j], k1 = Math.floor(p / G), k2 = p - k1 * G;
      neg[j] = ((G - k1) % G) * G + ((G - k2) % G);
      foldIdx[j] = (k1 % N) * N + (k2 % N);
    }
    const tbG = O.FFT.tables(G), tbN = O.FFT.tables(N), wN = O.FFT.work(N);
    const grid = new Float64Array(G * G * M);           // interleaved: grid[p * M + m]
    const zr = new Float64Array(G * G), zi = new Float64Array(G * G);
    const S_r = new Float64Array(G * G), S_i = new Float64Array(G * G);
    const Fr = new Float64Array(N * N), Fi = new Float64Array(N * N);
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    const frames = new Float32Array(N * N * T), fft = new Float32Array(2 * N * N * T);
    const gx = new Float64Array(tabN), gy = new Float64Array(tabN), wm = new Float64Array(M);
    const Vm = LR.V, inv2s2 = 0.5 / (sig * sig);

    // each particle keeps its own clock: it is imaged when its row is exposed or scanned
    const tp = new Float64Array(nTot);       // time of each particle's current position (s)
    const rowOf = function (y) { return det.crop_row0 + (y / a) * b; };
    const delay = function (y) {
      if (timing === "global") return 0;
      const r = rowOf(y);
      if (timing === "rolling_center") return Math.abs(r - det.rows_total / 2) * det.t_row_s;
      return r * det.t_row_s;
    };
    const freezeZ = cfg.test_freeze_z === true;
    const reflect = function (i) {
      const ae = classes[cls[i]].aex, lo = ae, hi = Lz - ae;
      let hz = H[i];
      while (hz < lo || hz > hi) { if (hz < lo) hz = 2 * lo - hz; if (hz > hi) hz = 2 * hi - hz; }
      H[i] = hz;
      X[i] -= L * Math.floor(X[i] / L); Y[i] -= L * Math.floor(Y[i] / L);
    };
    // Brownian motion. Spheres: isotropic. Particles with an axis: translation along and across the axis in the
    // particle frame, and rotation of the axis by a random angle; sub-steps keep D_r dt <= 0.03 (error about 1 %).
    const e1 = [0, 0, 0], e2 = [0, 0, 0];
    const frame = function (ux, uy, uz) {
      let ax, ay, az;
      if (Math.abs(uz) < 0.9) { ax = -uy; ay = ux; az = 0; } else { ax = 0; ay = -uz; az = uy; }   // z x u or x x u
      const n1 = Math.hypot(ax, ay, az); ax /= n1; ay /= n1; az /= n1;
      e1[0] = ax; e1[1] = ay; e1[2] = az;
      e2[0] = uy * az - uz * ay; e2[1] = uz * ax - ux * az; e2[2] = ux * ay - uy * ax;
    };
    // one translation step of duration hh with bulk displacements (dx, dy, dH): wall hindrance (with the Ito drift
    // of the position-dependent vertical diffusion) and sedimentation
    const nearWall = function (c, h, dt) { const r = 5 * Math.max(c.ah, Math.sqrt(2 * c.hyd.D_t * dt)); return walls && (h - c.aex < r || Lz - c.aex - h < r); };
    const moveBy = function (i, c, dx, dy, dH, hh) {
      let fp = 1, fz = 1, dfz = 0;
      if (walls) {
        const f = fWall(c, H[i]); fp = f[0]; fz = f[1];
        const e = 1e-3 * Math.max(c.ah, 0.01); dfz = (fWall(c, H[i] + e)[1] - fWall(c, H[i] - e)[1]) / (2 * e);
      }
      const sp = Math.sqrt(fp), sz = Math.sqrt(fz);
      X[i] += sp * dx; Y[i] += sp * dy;
      if (!freezeZ) {
        H[i] += sz * dH + c.hyd.D_t * dfz * hh;                                    // Ito drift keeps the equilibrium profile
        if (isFinite(c.lg)) H[i] -= c.hyd.D_t * fz * hh / c.lg;                   // sedimentation
      }
    };
    // sub-steps near a wall, so that hindrance and gravity are resolved (steps below 0.3 of the radius or gravitational length)
    const wallSteps = function (c, h, dt) {
      if (!nearWall(c, h, dt) && !(gravity && isFinite(c.lg) && Math.abs(c.lg) < 5 * Math.sqrt(2 * c.hyd.D_t * dt))) return 1;
      const sc = 0.3 * Math.min(c.ah, isFinite(c.lg) ? Math.abs(c.lg) : Infinity);
      return Math.max(1, Math.min(64, Math.ceil(2 * c.hyd.D_t * dt / (sc * sc))));
    };
    const advance = function (i, dt) {
      if (dt <= 0) return;
      const c = classes[cls[i]], hy = c.hyd;
      if (!oriented) {
        const nst = wallSteps(c, H[i], dt), hh = dt / nst, st = Math.sqrt(2 * hy.D_t * hh);
        for (let k = 0; k < nst; k++) { moveBy(i, c, st * rng.g(), st * rng.g(), st * rng.g(), hh); if (nst > 1) reflect(i); }
        X[i] += drift * dt; reflect(i); return;
      }
      if (hy.D_r * dt > 1 && !nearWall(c, H[i], dt)) {
        // the axis has forgotten its direction: new random axis, translation with the mean coefficient. The optics
        // depends on the axis only through u u (even orientation modes), whose memory exp(-6 D_r dt) is below 0.3 % here
        const st = Math.sqrt(2 * hy.D_t * dt);
        moveBy(i, c, st * rng.g(), st * rng.g(), st * rng.g(), dt);
        X[i] += drift * dt; randomAxis(i); reflect(i); return;
      }
      const nst = Math.max(wallSteps(c, H[i], dt), Math.min(400, Math.ceil(hy.D_r * dt / 0.03))), hh = dt / nst;
      const sPar = Math.sqrt(2 * hy.D_par * hh), sPer = Math.sqrt(2 * hy.D_perp * hh), sRot = Math.sqrt(2 * hy.D_r * hh);
      let ux = UX[i], uy = UY[i], uz = UZ[i];
      for (let k = 0; k < nst; k++) {
        frame(ux, uy, uz);
        const g0 = sPar * rng.g(), g1 = sPer * rng.g(), g2 = sPer * rng.g();
        // z points down (along the light): height decreases with the z component
        moveBy(i, c, g0 * ux + g1 * e1[0] + g2 * e2[0], g0 * uy + g1 * e1[1] + g2 * e2[1], -(g0 * uz + g1 * e1[2] + g2 * e2[2]), hh);
        if (walls || gravity) reflect(i);
        const w1 = sRot * rng.g(), w2 = sRot * rng.g(), om = Math.hypot(w1, w2);
        if (om > 0) {
          const cc = Math.cos(om), sn = Math.sin(om) / om;
          ux = cc * ux + sn * (w1 * e1[0] + w2 * e2[0]); uy = cc * uy + sn * (w1 * e1[1] + w2 * e2[1]); uz = cc * uz + sn * (w1 * e1[2] + w2 * e2[2]);
          const nn = Math.hypot(ux, uy, uz); ux /= nn; uy /= nn; uz /= nn;
        }
      }
      UX[i] = ux; UY[i] = uy; UZ[i] = uz;
      X[i] += drift * dt;
      reflect(i);
    };
    // swimmers: Brownian translation (in the body frame for particles with an axis), swimming along the axis,
    // rotational diffusion (in 3D, or within the plane for plane swimmers, plus circling), tumbles; walls mirror the
    // vertical part of the direction. Steps: D_r h <= 0.03, at most 0.5 um of swimming, tumble chance <= 5 %.
    const swimAdvance = function (i, dt) {
      if (dt <= 0) return;
      const c = classes[cls[i]], hy = c.hyd, v = SP[i], pl = PL[i] === 1;
      const Dr = swDr !== null ? swDr : hy.D_r;
      const nst = Math.max(1, Math.min(4000, Math.ceil(Math.max(Dr * dt / 0.03, v * dt / 0.5, swTumble * dt / 0.05, Math.abs(swOmega) * dt / 0.1))));
      const hh = dt / nst;
      const Dpa = oriented ? hy.D_par : hy.D_t, Dpe = oriented ? hy.D_perp : hy.D_t;
      const sPar = Math.sqrt(2 * Dpa * hh), sPer = Math.sqrt(2 * Dpe * hh), sRot = Math.sqrt(2 * Dr * hh);
      const lo = c.aex, hi = Lz - c.aex;
      let ux = UX[i], uy = UY[i], uz = UZ[i];
      for (let k = 0; k < nst; k++) {
        frame(ux, uy, uz);
        const g0 = sPar * rng.g(), g1 = sPer * rng.g(), g2 = sPer * rng.g();
        X[i] += g0 * ux + g1 * e1[0] + g2 * e2[0] + v * ux * hh + drift * hh;
        Y[i] += g0 * uy + g1 * e1[1] + g2 * e2[1] + v * uy * hh;
        if (!pl && !freezeZ) {
          H[i] -= g0 * uz + g1 * e1[2] + g2 * e2[2] + v * uz * hh;      // z points down: height decreases with uz
          if (H[i] < lo) { H[i] = 2 * lo - H[i]; uz = Math.abs(uz); }      // moving down (uz > 0) turns into moving up
          if (H[i] > hi) { H[i] = 2 * hi - H[i]; uz = -Math.abs(uz); }
          if (H[i] < lo || H[i] > hi) H[i] = Math.min(hi, Math.max(lo, H[i]));
        }
        if (swTumble > 0 && rng.u() < swTumble * hh) {
          if (pl) { const ph = TWO_PI * rng.u(); ux = Math.cos(ph); uy = Math.sin(ph); uz = 0; }
          else { const z = 2 * rng.u() - 1, ph = TWO_PI * rng.u(), r = Math.sqrt(1 - z * z); ux = r * Math.cos(ph); uy = r * Math.sin(ph); uz = z; }
          continue;
        }
        if (pl) {
          const th = Math.atan2(uy, ux) + sRot * rng.g() + swOmega * hh;
          ux = Math.cos(th); uy = Math.sin(th); uz = 0;
        } else if (sRot > 0) {
          const w1 = sRot * rng.g(), w2 = sRot * rng.g(), om = Math.hypot(w1, w2);
          if (om > 0) {
            const cc = Math.cos(om), sn = Math.sin(om) / om;
            ux = cc * ux + sn * (w1 * e1[0] + w2 * e2[0]); uy = cc * uy + sn * (w1 * e1[1] + w2 * e2[1]); uz = cc * uz + sn * (w1 * e1[2] + w2 * e2[2]);
            const nn = Math.hypot(ux, uy, uz); ux /= nn; uy /= nn; uz /= nn;
          }
        }
      }
      UX[i] = ux; UY[i] = uy; UZ[i] = uz;
      X[i] -= L * Math.floor(X[i] / L); Y[i] -= L * Math.floor(Y[i] / L);
    };
    // depth interpolation in one kernel block
    const zw = { col: 0, f: 0 };
    const zLocate = function (B, zp) {
      const zg = B.z_um; let lo = 0, hi = zg.length - 1;
      if (zp <= zg[0]) hi = 1; else if (zp >= zg[hi]) lo = hi - 1; else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (zg[mid] <= zp) lo = mid; else hi = mid; }
      zw.col = B.off + lo; zw.f = Math.max(0, Math.min(1, (zp - zg[lo]) / (zg[lo + 1] - zg[lo])));
    };
    const addBlock = function (bi, zp, wgt) {
      if (bi === undefined || wgt === 0) return;
      const B = blocks[bi]; zLocate(B, zp); const col = zw.col, f = zw.f; wgt /= B.scale;
      for (let m = 0; m < M; m++) wm[m] += wgt * (Vm[m][col] + f * (Vm[m][col + 1] - Vm[m][col]));
    };
    const splat = function (xp, yp) {
      const px = xp / h, py = yp / h, cx = Math.round(px), cy = Math.round(py);
      for (let j = -R; j <= R; j++) { const dx = cx + j - px, dy = cy + j - py; gx[j + R] = Math.exp(-dx * dx * inv2s2); gy[j + R] = Math.exp(-dy * dy * inv2s2); }
      for (let jy = 0; jy < tabN; jy++) {
        const row = ((cy - R + jy) % G + G) % G, wy = gy[jy];
        for (let jx = 0; jx < tabN; jx++) {
          const col2 = ((cx - R + jx) % G + G) % G, w = wy * gx[jx], base = (row * G + col2) * M;
          for (let m = 0; m < M; m++) grid[base + m] += w * wm[m];
        }
      }
    };
    // orientation weights of one particle (transmitted light through polarisers, anisotropic particles)
    const cw = { het: 0, hom: 0 };
    const channelWeights = function (c, ux, uy, uz) {
      const pc = O.polCoeffs(pol, c.aPerp, c.dA, ux, uy);
      cw.het = pc.het / c.aRef; cw.hom = pc.hom / (c.aRef * c.aRef);
      if (c.Wtab) { const t = Math.acos(Math.min(1, Math.abs(uz))) / (Math.PI / 2) * (c.Wtab.length - 1), j = Math.min(c.Wtab.length - 2, Math.floor(t)); cw.hom *= c.Wtab[j] + (t - j) * (c.Wtab[j + 1] - c.Wtab[j]); }
    };
    const subDt = nsub > 1 ? expo / nsub : 0;
    // test only: positions of the first particles at every frame
    const nTrack = cfg.test_track === true ? Math.min(nTot, 400) : 0;
    const track = nTrack ? { X: new Float64Array(nTrack * T), Y: new Float64Array(nTrack * T), H: new Float64Array(nTrack * T), SP: SP.slice(0, nTrack), PL: PL.slice(0, nTrack), n: nTrack, L: L } : null;
    const seenAcc = (!split && !body && classes.length > 1) ? classes.map(function () { return new Float64Array(nq); }) : null;
    const seenEvery = Math.max(1, Math.floor(T / 32));
    const swSeen = { ws: new Float64Array(nq), wn: new Float64Array(nq), wv: new Float64Array(nq), wv2: new Float64Array(nq) };
    for (let t = 0; t < T; t++) {
      grid.fill(0);
      const t0 = t * dtFrame;
      for (let i = 0; i < nTot; i++) {
        const del = delay(Y[i]), ci = cls[i], c = classes[ci], ch = chans[ci];
        for (let sub = 0; sub < nsub; sub++) {
          const when = t0 + del + (nsub > 1 ? (sub + 0.5) * subDt : 0);
          if (SW[i]) swimAdvance(i, when - tp[i]); else advance(i, when - tp[i]);
          if (when > tp[i]) tp[i] = when;
          let wHet = 0, wHom = 0;
          if (split) { channelWeights(c, UX[i], UY[i], UZ[i]); wHet = cw.het; wHom = cfg.test_no_hom === true ? 0 : cw.hom; }   // test_no_hom: test-only switch
          if (!body) {
            wm.fill(0); const zp = hf - H[i];
            if (split) { addBlock(ch.het, zp, wHet / nsub); addBlock(ch.hom, zp, wHom / nsub); } else addBlock(ch.all, zp, 1 / nsub);
            splat(X[i], Y[i]);
          } else {
            const P = c.pts, np = P.n, ux = UX[i], uy = UY[i], uz = UZ[i];
            frame(ux, uy, uz);
            const sc = 1 / (np * nsub);
            for (let k = 0; k < np; k++) {
              const bx = P.xyz[3 * k], by = P.xyz[3 * k + 1], bz = P.xyz[3 * k + 2];
              const lx = bx * ux + by * e1[0] + bz * e2[0], ly = bx * uy + by * e1[1] + bz * e2[1], lz = bx * uz + by * e1[2] + bz * e2[2];
              wm.fill(0); const zp = hf - H[i] + lz;      // lz along +z (the light): further from the condenser
              if (split) { addBlock(ch.het, zp, wHet * sc); addBlock(ch.hom, zp, wHom * sc); } else addBlock(ch.all, zp, sc);
              splat(X[i] + lx, Y[i] + ly);
            }
          }
        }
      }
      // swimmers: share of the signal from swimmers and their mean speed as seen (weights |K|^2 at a mid wave vector,
      // at each particle's depth), every few frames
      if (sw && t % seenEvery === 0) {
        for (let i = 0; i < nTot; i++) {
          const ch = chans[cls[i]], bi = ch.all !== undefined ? ch.all : ch.het !== undefined ? ch.het : ch.hom; if (bi === undefined) continue;
          const B = blocks[bi], nzb = B.z_um.length; zLocate(B, hf - H[i]);
          const lo = zw.col - B.off, f = zw.f, sv = SP[i] > 0;
          for (let iq = 0; iq < nq; iq++) {
            const o = iq * nzb + lo, vr = B.Kr[o] + f * (B.Kr[o + 1] - B.Kr[o]), vi = B.Ki[o] + f * (B.Ki[o + 1] - B.Ki[o]), w = vr * vr + vi * vi;
            if (sv) { swSeen.ws[iq] += w; swSeen.wv[iq] += w * SP[i]; swSeen.wv2[iq] += w * SP[i] * SP[i]; } else swSeen.wn[iq] += w;
          }
        }
      }
      if (track) for (let i = 0; i < nTrack; i++) { const o = t * nTrack + i; track.X[o] = X[i]; track.Y[o] = Y[i]; track.H[o] = H[i]; }
      // signal weight of each size class from where its particles actually are (every few frames)
      if (seenAcc && t % seenEvery === 0) {
        for (let i = 0; i < nTot; i++) {
          const ci = cls[i], B = blocks[chans[ci].all], nzb = B.z_um.length; zLocate(B, hf - H[i]);
          const lo = zw.col - B.off, f = zw.f, acc = seenAcc[ci];
          for (let iq = 0; iq < nq; iq++) {
            const o = iq * nzb + lo, vr = B.Kr[o] + f * (B.Kr[o + 1] - B.Kr[o]), vi = B.Ki[o] + f * (B.Ki[o + 1] - B.Ki[o]);
            acc[iq] += vr * vr + vi * vi;
          }
        }
      }
      // spectrum on the fine grid, two real grids per complex FFT
      S_r.fill(0); S_i.fill(0);
      for (let m = 0; m < M; m += 2) {
        const two = m + 1 < M;
        for (let p = 0, o = m; p < G * G; p++, o += M) { zr[p] = grid[o]; zi[p] = two ? grid[o + 1] : 0; }
        O.FFT.fft2T(zr, zi, G, tbG, -1, needRow);
        const W1 = UW[m], W2 = two ? UW[m + 1] : null, X1 = UWI[m], X2 = two ? UWI[m + 1] : null;
        for (let j = 0; j < act.length; j++) {
          const p = act[j], pn = neg[j];
          // A(k) = (Z(k) + conj Z(-k)) / 2, B(k) = (Z(k) - conj Z(-k)) / (2i)
          const Ar = 0.5 * (zr[p] + zr[pn]), Ai = 0.5 * (zi[p] - zi[pn]);
          const u1 = W1[p];
          if (complexK) { const v1 = X1[p]; S_r[p] += u1 * Ar - v1 * Ai; S_i[p] += u1 * Ai + v1 * Ar; }
          else { S_r[p] += u1 * Ar; S_i[p] += u1 * Ai; }
          if (two) {
            const Br = 0.5 * (zi[p] + zi[pn]), Bi = -0.5 * (zr[p] - zr[pn]), u2 = W2[p];
            if (complexK) { const v2 = X2[p]; S_r[p] += u2 * Br - v2 * Bi; S_i[p] += u2 * Bi + v2 * Br; }
            else { S_r[p] += u2 * Br; S_i[p] += u2 * Bi; }
          }
        }
      }
      // fold the fine spectrum onto the camera grid (aliasing); still transposed layout
      Fr.fill(0); Fi.fill(0);
      for (let j = 0; j < act.length; j++) { const p = act[j], pc = foldIdx[j]; Fr[pc] += S_r[p]; Fi[pc] += S_i[p]; }
      // inverse transform from transposed layout returns the image in normal layout
      O.FFT.fft2T(Fr, Fi, N, tbN, +1);
      const fo = t * N * N, inv = 1 / (N * N);
      for (let p = 0; p < N * N; p++) {
        const signal = Fr[p] * inv;                // particle part of the pixel value
        let e = (bgE + sigScale * signal) * colGain[p % N];
        if (e < 0) e = 0;
        e += Math.sqrt(enf * e) * rng.g() + readE * rng.g();
        if (e > fullWell) e = fullWell;
        frames[fo + p] = e; re[p] = e; im[p] = 0;
      }
      // Fourier transform of the recorded frame for the analysis (normal layout)
      O.FFT.fft2(re, im, N, tbN, wN, -1);
      const fo2 = 2 * fo;
      for (let p = 0; p < N * N; p++) { fft[fo2 + 2 * p] = re[p]; fft[fo2 + 2 * p + 1] = im[p]; }
      if ((t & 3) === 3) yield { stage: "Recording the movie", frac: 0.15 + 0.85 * (t + 1) / T };
    }

    // values the analysis has to recover, kept apart from the movie
    let wsum = 0, wD = 0, dnum = 0;
    // weights use the numbers actually drawn for this movie (rare large classes matter a lot in the signal)
    const nDrawn = classes.map(function () { return 0; }); for (let i = 0; i < nTot; i++) nDrawn[cls[i]]++;
    const frac = nDrawn.map(function (n) { return n / nTot; });
    classes.forEach(function (c, ci) {
      // weight of each class in the signal: number x mean |K|^2 over the cell at a mid wave vector (bodies: volume^2)
      let w;
      if (split || body) w = frac[ci] * c.geo.volume * c.geo.volume;
      else {
        const B = blocks[chans[ci].all], iq = Math.round(0.35 * (nq - 2)); let k2 = 0; const nz = B.z_um.length;
        for (let j = 0; j < nz; j++) { const v = B.Kr[iq * nz + j], vi = B.Ki[iq * nz + j]; k2 += v * v + vi * vi; }
        w = seenAcc ? seenAcc[ci][iq] / nTot : frac[ci] * k2 / nz;   // realised heights when tracked (same units up to a constant)
      }
      wsum += w; wD += w * c.hyd.D_t; dnum += c.w * c.d;
    });
    const Dseen = wD / wsum;
    // the same weights at every kernel q (spheres without polarisers): the reader can average over the q actually used
    let seenTable = null;
    if (!split && !body && classes.length > 1) {
      seenTable = { q_per_um: Array.from(qk), D_um2_s: classes.map(function (c) { return c.hyd.D_t; }), w: [] };
      // weights from the heights the particles actually had (a few large particles far from focus count little)
      const nS = Math.ceil(T / seenEvery);   // samples taken: w = sum over the class's particles of |K|^2 per frame
      classes.forEach(function (c, ci) { seenTable.w.push(Array.from(seenAcc[ci], function (v) { return v / nS; })); });
    }
    const cm = classes[Math.floor(classes.length / 2)], chm = chans[Math.floor(classes.length / 2)];
    const kInfo = function (bi) { if (bi === undefined) return null; const B = blocks[bi]; return { Kr: B.Kr, Ki: B.Ki, nd: B.nd, z_um: B.z_um }; };
    const h0 = classes[0].hyd, hd0 = O.hydrodynamics(O.shapeGeometry(shape, d0, pAsp), kT, eta);
    return {
      test_track: track || undefined,
      test_heights: cfg.test_return_heights === true ? { H: Float64Array.from(H), lg: classes[0].lg, aex: classes[0].aex, ah: classes[0].ah } : undefined,   // test only
      n: N, T: T, frames: frames, fft: fft,
      pixel_um: a, L_um: L, frame_rate_hz: fr, T_C: T_C, viscosity_Pa_s: eta,
      q_opt_per_um: trans ? TWO_PI * Math.min(na, 1.34) / lamRef : 2 * TWO_PI * Math.min(na, 1.34) / lamRef,
      q_signal_max_per_um: qcut,
      info: { mode: mode, dark: dark, directions: nd, n_particles: nTot, n_points: Math.round(ptsTotal), exposure_substeps: nsub, timing: timing, readout_s: readout, read_noise_e: readE, full_well_e: fullWell, oversampling: s, truncated_q_per_um: truncated ? qKmax : null, rank: M, rank_residual: LR.residual, Cext_um2: Cext, background_e: bgE, wavelength_um: lamRef, kernel_q: qk,
              kernel: chm.all !== undefined ? kInfo(chm.all) : (chm.het !== undefined ? kInfo(chm.het) : kInfo(chm.hom)), classes: classes.map(function (c) { return { d: c.d, w: c.w }; }),
              split: split, channels: split ? { het: kInfo(chm.het), hom: kInfo(chm.hom) } : null,
              particle: { shape: shape, oriented: oriented, body: body, aspect: pAsp, birefringence: dn, geometry: cm.geo, points: body ? { xyz: cm.pts.xyz, n: cm.pts.n, spacing: cm.pts.spacing } : null,
                          alpha_perp: cm.aPerp, dalpha: cm.dA, alpha_ref: cm.aRef, Wtab: cm.Wtab || null, polarization: pol, background_share: bgf } },
      truth: { diameter_um: d0, mean_diameter_um: dnum, D_um2_s: hd0.D_t, D_seen_um2_s: Dseen, seen_table: seenTable, diameter_seen_um: kT / (3 * Math.PI * eta * Dseen * 1e-12) * 1e6, drift_um_s: drift,
               D_plane_um2_s: hd0.D_t * fParFocus, D_plane_all_um2_s: hd0.D_t * fParMean, walls: walls, gravity: gravity, gravitational_length_um: isFinite(classes[0].lg) ? classes[0].lg : null,
               swim: sw ? (function () {
                 const n = swList.length, m = n ? swList.reduce(function (p, v) { return p + v; }, 0) / n : 0;
                 const sd = n > 1 ? Math.sqrt(swList.reduce(function (p, v) { return p + (v - m) * (v - m); }, 0) / (n - 1)) : 0;
                 let nPl = 0; for (let i = 0; i < nTot; i++) if (PL[i]) nPl++;
                 // as seen by the microscope, per kernel wave vector (the signal of each particle at its depth); headline at
                 // a mid wave vector, the reader can average over the q actually used with seen_table
                 const iqm = Math.round(0.35 * (nq - 2)), tab = { q_per_um: Array.from(qk), fraction: [], v_mean_um_s: [] };
                 for (let iq = 0; iq < nq; iq++) { const W = swSeen.ws[iq] + swSeen.wn[iq]; tab.fraction.push(W > 0 ? swSeen.ws[iq] / W : null); tab.v_mean_um_s.push(swSeen.ws[iq] > 0 ? swSeen.wv[iq] / swSeen.ws[iq] : null); }
                 const vs = swSeen.ws[iqm] > 0 ? swSeen.wv[iqm] / swSeen.ws[iqm] : null;
                 return { fraction: n / nTot, v_mean_um_s: m, v_sd_um_s: sd, seen_table: tab,
                          fraction_seen: tab.fraction[iqm], v_mean_seen_um_s: vs,
                          v_sd_seen_um_s: vs !== null ? Math.sqrt(Math.max(0, swSeen.wv2[iqm] / swSeen.ws[iqm] - vs * vs)) : null, v_list: Float32Array.from(swList), n_swimmers: n, n_plane: nPl,
                          v_set_um_s: swV, v_spread_set: swSpread, fraction_set: swFrac, plane_fraction_set: swPlane, rot_diff_s: swDr !== null ? swDr : hd0.D_r, tumble_hz: swTumble, circle_rad_s: swOmega };
               })() : null,
               shape: shape, oriented: oriented, D_r_s: oriented ? hd0.D_r : null, D_par_um2_s: hd0.D_par, D_perp_um2_s: hd0.D_perp, rot_rate_s: oriented ? 6 * hd0.D_r : null, first_class_D_um2_s: h0.D_t }
    };
  }

  /* Terms that make up the image of one particle with axis (ux, uy, uz), for drawing it: each term is a point
   * (x, y, z relative to the centre, um) with weights for the kernel channels (all, het, hom). */
  function particleTerms(info, ux, uy, uz) {
    const P = info.particle, out = [];
    let het = 1, hom = 1;
    if (info.split) {
      const pc = O.polCoeffs(P.polarization, P.alpha_perp, P.dalpha, ux, uy);
      het = pc.het / P.alpha_ref; hom = pc.hom / (P.alpha_ref * P.alpha_ref);
      if (P.Wtab) { const t = Math.acos(Math.min(1, Math.abs(uz))) / (Math.PI / 2) * (P.Wtab.length - 1), j = Math.min(P.Wtab.length - 2, Math.floor(t)); hom *= P.Wtab[j] + (t - j) * (P.Wtab[j + 1] - P.Wtab[j]); }
    }
    if (!P.body) { out.push({ x: 0, y: 0, z: 0, all: 1, het: het, hom: hom }); return out; }
    let ax, ay, az; if (Math.abs(uz) < 0.9) { ax = -uy; ay = ux; az = 0; } else { ax = 0; ay = -uz; az = uy; }
    const n1 = Math.hypot(ax, ay, az); ax /= n1; ay /= n1; az /= n1;
    const bx2 = uy * az - uz * ay, by2 = uz * ax - ux * az, bz2 = ux * ay - uy * ax, n = P.points.n;
    for (let k = 0; k < n; k++) {
      const p0 = P.points.xyz[3 * k], p1 = P.points.xyz[3 * k + 1], p2 = P.points.xyz[3 * k + 2];
      out.push({ x: p0 * ux + p1 * ax + p2 * bx2, y: p0 * uy + p1 * ay + p2 * by2, z: p0 * uz + p1 * az + p2 * bz2, all: 1 / n, het: het / n, hom: hom / n });
    }
    return out;
  }

  const api = { simulate: simulate, particleTerms: particleTerms };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MOVIE = api;
})(this);
