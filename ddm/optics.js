/* Optics for the DDM page: how one particle looks in a Nikon Ti2-E, and movies of many.
 *
 * Image formation (all lengths in micrometres, wave vectors in rad/um):
 *   Bright field: Koehler illumination = incoherent sum over source points filling the
 *     condenser aperture (spatial coherence) and over wavelengths of the lamp spectrum
 *     (temporal coherence). For each source point and wavelength, the transmitted plane
 *     wave interferes with the field scattered by the sphere (exact Mie amplitudes,
 *     scalar approximation S = (S1 + S2)/2, unpolarized light) after the objective pupil.
 *     Both the interference (heterodyne) term and the scattered-intensity (homodyne)
 *     term are kept. Defocus enters through the axial phase of each plane wave.
 *   Widefield fluorescence: incoherent emission, scalar Debye point spread function
 *     with aplanatic apodization sqrt(cos theta), convolved with the dyed sphere.
 *   Spinning-disk confocal: excitation PSF times (emission PSF convolved with the
 *     back-projected pinhole); crosstalk between pinholes is neglected.
 * The image of one particle at axial position z (along the light, focal plane z = 0)
 * is stored as its 2D Fourier transform K(q, z), which is real and depends only on
 * |q| because everything is rotationally symmetric. Movies: dilute particles add
 * linearly (no multiple scattering, no interference between different particles).
 * Pupil: |kappa| <= k0 * min(NA, n_liquid) (an oil or silicone objective cannot collect
 * beyond n_liquid in the sample); index-mismatch aberrations are not included.
 */
(function (root) {
  "use strict";
  function fail(msg) { throw new Error("Optics: " + msg); }
  function need(c, msg) { if (!c) fail(msg); }
  const TWO_PI = 2 * Math.PI;

  // ---- refractive indices (lambda in um, vacuum) ------------------------------
  // Polystyrene and PMMA: Sultanova et al., Acta Phys. Pol. A 116, 585 (2009), one-term Sellmeier.
  // Fused silica: Malitson, J. Opt. Soc. Am. 55, 1205 (1965). Stober silica colloids are
  //   usually a little lower (about 1.43-1.45); use "custom" for a measured value.
  // Water: Cauchy fit n = 1.3242 + 0.00306 / lambda^2 (matches 1.3330 at 589 nm and 1.3429 at 405 nm).
  // Water-glycerol (20 C): n_D from tabulated mass-fraction data, dispersion interpolated
  //   between water and glycerol (approximate, about 0.001).
  const MATERIALS = {
    ps: { label: "Polystyrene", rho: 1.05, n: function (l) { const L = l * l; return Math.sqrt(1 + 1.4435 * L / (L - 0.020216)); } },
    pmma: { label: "PMMA", rho: 1.19, n: function (l) { const L = l * l; return Math.sqrt(1 + 1.1819 * L / (L - 0.011313)); } },
    silica: { label: "Silica (fused-silica index)", rho: 2.0, n: function (l) { const L = l * l; return Math.sqrt(1 + 0.6961663 * L / (L - 0.0046791) + 0.4079426 * L / (L - 0.0135121) + 0.8974794 * L / (L - 97.934003)); } },
    // polymerised reactive mesogen RM257: ordinary index 1.508 (extraordinary 1.687, Merck data); dispersion neglected
    rm257: { label: "Polymerised liquid crystal (RM257, ordinary index)", rho: 1.2, n: function () { return 1.508; } },
    // Hyflon MFA (Solvay): copolymer of tetrafluoroethylene and perfluoromethylvinylether, partially crystalline, so
    // optically anisotropic; n = 1.352 (COLIS paper, npj Microgravity 2024, citing Degiorgio, Piazza and Bellini 1994)
    mfa: { label: "Hyflon MFA (fluoropolymer, partially crystalline)", rho: 2.14, n: function () { return 1.352; } },
    // bacteria: average index about 1.38-1.40 (literature range); dispersion neglected
    bacterium: { label: "Bacterium (index 1.39, approximate)", rho: 1.10, n: function () { return 1.39; } }
  };
  const GLY_ND = [1.3330, 1.3448, 1.3572, 1.3703, 1.3841, 1.3981, 1.4124, 1.4265, 1.4410, 1.4555, 1.4730]; // w = 0, 0.1, ... 1
  function nWater(l) { return 1.3242 + 0.00306 / (l * l); }
  function nWaterGlycerol(w, l) {
    need(w >= 0 && w <= 1, "glycerol mass fraction out of range");
    const i = Math.min(9, Math.floor(w * 10)), f = w * 10 - i;
    const nD = GLY_ND[i] + f * (GLY_ND[i + 1] - GLY_ND[i]);
    const B = 0.00306 + w * (0.0048 - 0.00306);      // approximate Cauchy B of the mixture
    return nD + B * (1 / (l * l) - 1 / (0.5893 * 0.5893));
  }
  // Viscosity of water-glycerol mixtures: Cheng, Ind. Eng. Chem. Res. 47, 3285 (2008). mPa s, T in C.
  function viscosityWaterGlycerol_mPa_s(w, T_C) {
    need(w >= 0 && w <= 1, "glycerol mass fraction out of range");
    need(T_C >= 0 && T_C <= 100, "temperature out of range");
    const muW = 1.790 * Math.exp((-1230 - T_C) * T_C / (36100 + 360 * T_C));
    const muG = 12100 * Math.exp((-1233 + T_C) * T_C / (9900 + 70 * T_C));
    const a = 0.705 - 0.0017 * T_C, b = (4.9 + 0.036 * T_C) * Math.pow(a, 2.5);
    const alpha = 1 - w + (a * b * w * (1 - w)) / (a * w + b * (1 - w));
    return Math.pow(muW, alpha) * Math.pow(muG, 1 - alpha);
  }

  // ---- Mie theory (Bohren and Huffman BHMIE, real or complex relative index) -------
  // returns S1, S2 (complex) at the requested cos(theta) values, Qext, Qsca, and S(0)
  function mie(m_re, m_im, x, mus) {
    need(x > 0 && x < 1000, "size parameter out of range: " + x);
    const nstop = Math.round(x + 4.05 * Math.pow(x, 1 / 3) + 2);
    const ymod = Math.hypot(m_re * x, m_im * x);
    const nmx = Math.round(Math.max(nstop, ymod) + 15);
    // logarithmic derivative D_n(mx), downward recurrence (complex)
    const yr = m_re * x, yi = m_im * x;
    const Dr = new Float64Array(nmx + 1), Di = new Float64Array(nmx + 1);
    for (let n = nmx; n >= 2; n--) {
      // D_{n-1} = n/y - 1/(D_n + n/y)
      const ny_r = n * yr / (yr * yr + yi * yi), ny_i = -n * yi / (yr * yr + yi * yi);
      const sr = Dr[n] + ny_r, si = Di[n] + ny_i, den = sr * sr + si * si;
      Dr[n - 1] = ny_r - sr / den; Di[n - 1] = ny_i + si / den;
    }
    const nm = mus.length;
    const S1r = new Float64Array(nm), S1i = new Float64Array(nm), S2r = new Float64Array(nm), S2i = new Float64Array(nm);
    const pi0 = new Float64Array(nm), pi1 = new Float64Array(nm).fill(1);
    let psi0 = Math.cos(x), psi1 = Math.sin(x), chi0 = -Math.sin(x), chi1 = Math.cos(x);
    let xi1r = psi1, xi1i = -chi1;
    let qsca = 0, qext = 0;
    let anr = 0, ani = 0, bnr = 0, bni = 0;
    for (let n = 1; n <= nstop; n++) {
      const fn = (2 * n + 1) / (n * (n + 1));
      const psi = (2 * n - 1) * psi1 / x - psi0, chi = (2 * n - 1) * chi1 / x - chi0;
      const xir = psi, xii = -chi;
      // a_n = ((D/m + n/x) psi - psi1) / ((D/m + n/x) xi - xi1)
      const mden = m_re * m_re + m_im * m_im;
      const dmr = (Dr[n] * m_re + Di[n] * m_im) / mden, dmi = (Di[n] * m_re - Dr[n] * m_im) / mden;
      let tr = dmr + n / x, ti = dmi;
      let numr = tr * psi - psi1, numi = ti * psi;
      let denr = tr * xir - ti * xii - xi1r, deni = tr * xii + ti * xir - xi1i;
      let dd = denr * denr + deni * deni;
      anr = (numr * denr + numi * deni) / dd; ani = (numi * denr - numr * deni) / dd;
      // b_n = ((m D + n/x) psi - psi1) / ((m D + n/x) xi - xi1)
      tr = m_re * Dr[n] - m_im * Di[n] + n / x; ti = m_re * Di[n] + m_im * Dr[n];
      numr = tr * psi - psi1; numi = ti * psi;
      denr = tr * xir - ti * xii - xi1r; deni = tr * xii + ti * xir - xi1i;
      dd = denr * denr + deni * deni;
      bnr = (numr * denr + numi * deni) / dd; bni = (numi * denr - numr * deni) / dd;
      qsca += (2 * n + 1) * (anr * anr + ani * ani + bnr * bnr + bni * bni);
      qext += (2 * n + 1) * (anr + bnr);
      for (let j = 0; j < nm; j++) {
        const mu = mus[j];
        const pi = pi1[j];
        const tau = n * mu * pi - (n + 1) * pi0[j];
        S1r[j] += fn * (anr * pi + bnr * tau); S1i[j] += fn * (ani * pi + bni * tau);
        S2r[j] += fn * (anr * tau + bnr * pi); S2i[j] += fn * (ani * tau + bni * pi);
        const pinext = ((2 * n + 1) * mu * pi - (n + 1) * pi0[j]) / n;
        pi0[j] = pi; pi1[j] = pinext;
      }
      psi0 = psi1; psi1 = psi; chi0 = chi1; chi1 = chi; xi1r = psi1; xi1i = -chi1;
    }
    return { S1r: S1r, S1i: S1i, S2r: S2r, S2i: S2i, Qsca: 2 * qsca / (x * x), Qext: 2 * qext / (x * x), nstop: nstop };
  }

  // ---- light sources (vacuum wavelengths in um, weights summing to 1) -------------
  // Spectra are approximate shapes, sampled with Gauss-Hermite points for Gaussian bands.
  const GH = { x: [-2.0201828705, -0.9585724646, 0, 0.9585724646, 2.0201828705], w: [0.0199532421, 0.3936193232, 0.9453087205, 0.3936193232, 0.0199532421] };
  function gaussBand(center_um, fwhm_um) {
    const s = fwhm_um / 2.3548, out = [];
    let W = 0; GH.w.forEach(function (w) { W += w; });
    for (let i = 0; i < 5; i++) out.push({ l: center_um + Math.SQRT2 * s * GH.x[i], w: GH.w[i] / W });
    return out;
  }
  function planck(T_K, lo, hi, n) {
    const out = []; let W = 0;
    for (let i = 0; i < n; i++) {
      const l = lo + (hi - lo) * (i + 0.5) / n;  // um
      const w = 1 / (Math.pow(l, 5) * (Math.exp(14387.77 / (l * T_K)) - 1));
      out.push({ l: l, w: w }); W += w;
    }
    out.forEach(function (p) { p.w /= W; });
    return out;
  }
  function denseGauss(c, fwhm, n) { const s = fwhm / 2.3548, out = []; let W = 0; for (let i = 0; i < n; i++) { const l = c - 3 * s + 6 * s * (i + 0.5) / n, w = Math.exp(-0.5 * Math.pow((l - c) / s, 2)); out.push({ l: l, w: w }); W += w; } out.forEach(function (p) { p.w /= W; }); return out; }
  // a source built from Gaussian bands [centre um, FWHM um, weight]
  function bands(list) {
    const W = list.reduce(function (a, b) { return a + b[2]; }, 0);
    return {
      sample: function () { let out = []; list.forEach(function (b) { out = out.concat(gaussBand(b[0], b[1]).map(function (p) { return { l: p.l, w: p.w * b[2] / W }; })); }); return out; },
      dense: function (n) { let out = []; list.forEach(function (b, k) { const m = Math.max(3, Math.round(n * b[2] / W)); out = out.concat(denseGauss(b[0], b[1], m).map(function (p) { return { l: p.l, w: p.w * b[2] / W }; })); }); return out; }
    };
  }
  function src(label, def) { return Object.assign({ label: label }, def); }
  const blackbody = function (T, lo, hi) { return { sample: function () { return planck(T, lo, hi, 7); }, dense: function (n) { return planck(T, lo, hi, n); } }; };
  // Transmitted-light sources. LEDs: nominal centre and FWHM from the makers' data (Thorlabs mounted LEDs); white
  // LEDs as a blue pump plus a broad phosphor band (shapes approximate). The halogen lamp is a 3200 K black body
  // cut to 400-700 nm (camera and infrared filter). Where the maker gives no bandwidth it is a typical value (marked).
  const SOURCES = {
    green: src("Green band-pass filter, 550/40 nm", bands([[0.550, 0.040, 1]])),
    halogen: src("Nikon: halogen lamp 12 V 100 W, about 3200 K (400-700 nm)", blackbody(3200, 0.40, 0.70)),
    led_white: src("Nikon: Ti2 LED illuminator, white LED (approximate spectrum)", bands([[0.450, 0.022, 0.3], [0.560, 0.110, 0.7]])),
    m455: src("Thorlabs M455L3: 455 nm, FWHM 18 nm", bands([[0.455, 0.018, 1]])),
    m470: src("Thorlabs M470L5: 470 nm, FWHM 28 nm", bands([[0.470, 0.028, 1]])),
    m505: src("Thorlabs M505L4: 505 nm, FWHM 37 nm", bands([[0.505, 0.037, 1]])),
    m530: src("Thorlabs M530L4: 530 nm, FWHM 35 nm", bands([[0.530, 0.035, 1]])),
    m565: src("Thorlabs M565L3 (lime): 565 nm, FWHM 104 nm", bands([[0.565, 0.104, 1]])),
    m590: src("Thorlabs M590L3: 590 nm, FWHM 18 nm", bands([[0.590, 0.018, 1]])),
    m625: src("Thorlabs M625L4: 625 nm, FWHM 17 nm", bands([[0.625, 0.017, 1]])),
    mcwh: src("Thorlabs MCWHL7: cold white, 6500 K (approximate spectrum)", bands([[0.450, 0.020, 0.35], [0.555, 0.120, 0.65]])),
    mwwh: src("Thorlabs MWWHL4: warm white, 3000 K (approximate spectrum)", bands([[0.450, 0.020, 0.12], [0.600, 0.140, 0.88]])),
    pt100w: src("CoolLED pT-100 white: halogen-like, about 3000 K", blackbody(3000, 0.42, 0.70)),
    pt525: src("CoolLED pT-100 525 nm (FWHM about 30 nm, typical)", bands([[0.525, 0.030, 1]])),
    pt635: src("CoolLED pT-100 635 nm (FWHM about 17 nm, typical)", bands([[0.635, 0.017, 1]])),
    pt770: src("CoolLED pT-100 770 nm, near infrared (FWHM about 30 nm, typical)", bands([[0.770, 0.030, 1]])),
    blue436: src("Blue LED, 436 nm (as in fastDDM tutorial 6)", bands([[0.436, 0.008 * 2.3548, 1]])),
    mono: { label: "Narrow line, 532 nm (laser-like)", sample: function () { return [{ l: 0.532, w: 1 }]; } }
  };

  // ---- source points in the condenser aperture (uniform in direction cosines) -------
  function sourcePoints(na_c, n_rings) {
    const pts = [{ ux: 0, uy: 0, w: 1 }];
    if (na_c <= 0) return pts;
    for (let r = 1; r <= n_rings; r++) {
      const rho = na_c * r / n_rings, m = 6 * r, off = (r % 2) * Math.PI / m;
      for (let j = 0; j < m; j++) { const a = off + TWO_PI * j / m; pts.push({ ux: rho * Math.cos(a), uy: rho * Math.sin(a), w: 1 }); }
    }
    // equal weights = equal area per point for this hexagonal-ring layout
    const W = pts.length; pts.forEach(function (p) { p.w = 1 / W; });
    return pts;     // ux, uy are NA-like (n sin theta); kappa = k0 * u
  }

  // ---- bright-field kernel ------------------------------------------------------
  /* cfg: diameter_um, particle (material key or {n}), liquid {glycerol_w} or {n},
   *   na_obj, na_cond, source (key), q_per_um (Float64Array radial grid), z_um (Float64Array),
   *   homodyne (true/false)
   * returns { K: Float64Array(nq * nz) [iq * nz + iz], imag_ratio, Cext_um2, Csca_um2, ... } */
  // material key, {n} (fixed index) or {base, add} (material index plus a constant, e.g. the mean index of a birefringent material)
  function particleIndex(p, l) {
    if (typeof p === "object") { if (p.base !== undefined) return particleIndex(p.base, l) + (p.add || 0); return p.n; }
    need(MATERIALS[p], "unknown material " + p); return MATERIALS[p].n(l);
  }
  // densities in g/cm3. Particles: PS 1.05, PMMA 1.19 (maker's data), Stober silica about 2.0 (1.9-2.2), MFA 2.14
  // (Piazza et al., buoyancy paper), E. coli 1.10 (BioNumbers), RM257 polymer about 1.2 (assumed). Liquids: water
  // (Thiesen formula), glycerol 1.261 at 20 C, mixtures by ideal mixing of volumes (about 1 % low at most).
  function particleDensity(p) { if (typeof p === "object") { if (p.base !== undefined) return particleDensity(p.base); return p.rho !== undefined ? p.rho : 1.05; } need(MATERIALS[p], "unknown material " + p); return MATERIALS[p].rho; }
  function waterDensity(T) { return 1 - (T - 3.983) * (T - 3.983) * (T + 283) / (503570 * (T + 67.26)); }
  function liquidDensity(liq, T) {
    if (liq.n !== undefined) return liq.density_g_cm3 !== undefined ? liq.density_g_cm3 : waterDensity(T);
    const w = liq.glycerol_w, rg = 1.261 - 0.00065 * (T - 20);
    return 1 / (w / rg + (1 - w) / waterDensity(T));
  }
  function liquidIndex(liq, l) { if (liq.n !== undefined) return liq.n; return nWaterGlycerol(liq.glycerol_w, l); }

  /* Transmitted-light kernel for bright field, phase contrast, dark field and DIC.
   * Illumination: Koehler, filling a disk or an annulus of the condenser aperture (NA units, in the liquid).
   * The sum over the illumination is done as an integral: the illuminated area (in direction cosines) is
   * cut into small triangles; over each triangle the axial phase rate Delta = kz_in - kz_out is taken as
   * linear, so its distribution is a tent function deposited exactly into a fine histogram over Delta.
   * One FFT of that histogram gives K(q, z) at every z (no spurious "revivals" far from focus in thick
   * cells). Wavelengths are summed into the same histogram.
   * Pupil: aplanatic apodization sqrt(cos theta) times an optional complex mask:
   *   phase: annular phase ring (amplitude transmission t, phase shift phi) between two NA values;
   *   dic:   Nomarski, i sin((kappa . s + bias) / 2) for shear s and bias retardation (crossed polarisers).
   * DIC is not rotationally symmetric, so K is computed along several directions of q and is complex.
   * With no direct light inside the objective (dark field), only the scattered-intensity term remains and
   * the kernel is normalised by the incident light instead of by the background. */
  function pupilMask(p, kx, ky, k0) {
    if (!p || p.kind === "none") return [1, 0];
    if (p.kind === "phase") {
      const u = Math.hypot(kx, ky) / k0;
      if (u >= p.ring_in && u <= p.ring_out) return [p.amp * Math.cos(p.phase), p.amp * Math.sin(p.phase)];
      return [1, 0];
    }
    if (p.kind === "dic") { const ks = p.shear_um * (kx * Math.cos(p.angle) + ky * Math.sin(p.angle)); return [0, Math.sin((ks + p.bias) / 2)]; }
    fail("unknown pupil " + p.kind);
  }
  /* Spherical aberration from focusing into a liquid whose index n_s differs from the immersion index n_i
   * (Gibson and Lanni, without the coverslip term). With the stage moved by D, a point at height h above the
   * coverslip reaches the pupil with phase k0 [h sqrt(n_s^2 - u^2) - D sqrt(n_i^2 - u^2)], u = n sin(theta).
   * The h term is plain defocus and is already in the depth dependence of every kernel. Of the D term, the
   * part that a defocus cannot remove is kept; D is chosen so that the least-squares best focus lies at depth d.
   * Returns null when there is nothing to correct. */
  function aberrationFit(ab, n_s, umax) {
    if (!ab || !(ab.depth_um > 0) || !(ab.n_imm > 0) || Math.abs(ab.n_imm - n_s) < 1e-4) return null;
    const ni = ab.n_imm, N = 400;
    need(umax < Math.min(ni, n_s), "aperture beyond the immersion or the liquid");
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < N; i++) {
      const u = umax * (i + 0.5) / N, w = u, x = Math.sqrt(n_s * n_s - u * u), y = Math.sqrt(ni * ni - u * u);
      sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
    }
    const a = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), b = (sy - a * sx) / sw;
    // residual (per k0 D) tabulated in u^2 for the inner loops; linear interpolation errs by under 2e-3 rad at the edge
    const NT = 8192, s2max = umax * umax, res = new Float64Array(NT + 1);
    let maxRes = 0;
    for (let i = 0; i <= NT; i++) { const u2 = s2max * i / NT; res[i] = Math.sqrt(ni * ni - u2) - a * Math.sqrt(n_s * n_s - u2) - b; maxRes = Math.max(maxRes, Math.abs(res[i])); }
    return { ni: ni, ns: n_s, a: a, b: b, D: ab.depth_um / a, res: res, s2max: s2max, maxRes: maxRes };
  }
  // the fit, or null when the largest phase error over the pupil stays below 0.02 rad (e.g. water objective in water)
  function aberrationFor(ab, n_s, umax, k0) {
    const A = aberrationFit(ab, n_s, umax);
    return A && k0 * Math.abs(A.D) * A.maxRes > 0.02 ? A : null;
  }
  // pupil phase (radians) at u = |k_t| / k0 for the fit above
  function aberrationPhase(A, u, k0) {
    if (!A) return 0;
    const u2 = Math.min(u * u, A.ns * A.ns, A.ni * A.ni);
    if (u2 <= A.s2max) { const NT = A.res.length - 1, t = u2 / A.s2max * NT, i = Math.min(NT - 1, Math.floor(t)), f = t - i; return -k0 * A.D * (A.res[i] + f * (A.res[i + 1] - A.res[i])); }
    return -k0 * A.D * (Math.sqrt(A.ni * A.ni - u2) - A.a * Math.sqrt(A.ns * A.ns - u2) - A.b);
  }
  function pupilAt(p, A, kx, ky, k0) {
    const m = pupilMask(p, kx, ky, k0);
    if (!A) return m;
    const ph = aberrationPhase(A, Math.hypot(kx, ky) / k0, k0), c = Math.cos(ph), s = Math.sin(ph);
    return [m[0] * c - m[1] * s, m[0] * s + m[1] * c];
  }
  /* Vector weights. An aplanatic objective maps a plane wave of direction d and polarisation v to the camera as
   * (v . e_theta) rho + (v . e_phi) e_phi. For unpolarised light of direction a scattered into direction b, the
   * interference of scattered and direct light, averaged over the two polarisations, is G1 S1 + G2 S2 with
   * G1 = (M_a s . M_b s) / 2 and G2 = (M_a p_a . M_b p_b) / 2, where s is normal to the scattering plane and
   * p = s x direction. Forward (a = b) gives (S1 + S2) / 2, the scalar value. */
  function mapT(v, d) {
    const st = Math.hypot(d[0], d[1]), cp = st > 1e-12 ? d[0] / st : 1, sp = st > 1e-12 ? d[1] / st : 0, ct = d[2];
    const vt = v[0] * ct * cp + v[1] * ct * sp - v[2] * st, vp = -v[0] * sp + v[1] * cp;
    return [vt * cp - vp * sp, vt * sp + vp * cp];
  }
  function scatterBasis(a, b) {
    let sx = a[1] * b[2] - a[2] * b[1], sy = a[2] * b[0] - a[0] * b[2], sz = a[0] * b[1] - a[1] * b[0];
    const sn = Math.hypot(sx, sy, sz);
    if (sn < 1e-10) {   // forward: any normal to a
      const t = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      sx = a[1] * t[2] - a[2] * t[1]; sy = a[2] * t[0] - a[0] * t[2]; sz = a[0] * t[1] - a[1] * t[0];
      const n2 = Math.hypot(sx, sy, sz); sx /= n2; sy /= n2; sz /= n2;
    } else { sx /= sn; sy /= sn; sz /= sn; }
    const s = [sx, sy, sz];
    const pa = [sy * a[2] - sz * a[1], sz * a[0] - sx * a[2], sx * a[1] - sy * a[0]];
    const pb = [sy * b[2] - sz * b[1], sz * b[0] - sx * b[2], sx * b[1] - sy * b[0]];
    return { s: s, pa: pa, pb: pb };
  }
  const HALF2 = [0.5, 0.5];
  // same as vectorWeights, without allocations (inner loop of the interference term); writes [G1, G2] into out
  function mapInto(vx, vy, vz, dx, dy, dz, out, o) {
    const st = Math.sqrt(dx * dx + dy * dy), cp = st > 1e-12 ? dx / st : 1, sp = st > 1e-12 ? dy / st : 0;
    const vt = (vx * cp + vy * sp) * dz - vz * st, vp = -vx * sp + vy * cp;
    out[o] = vt * cp - vp * sp; out[o + 1] = vt * sp + vp * cp;
  }
  const VW = new Float64Array(8);
  function vectorWeightsInto(ax, ay, az, bx, by, bz, out) {
    let sx = ay * bz - az * by, sy = az * bx - ax * bz, sz = ax * by - ay * bx;
    const sn = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sn < 1e-10) { out[0] = 0.5; out[1] = 0.5; return out; }
    sx /= sn; sy /= sn; sz /= sn;
    const pax = sy * az - sz * ay, pay = sz * ax - sx * az, paz = sx * ay - sy * ax;
    const pbx = sy * bz - sz * by, pby = sz * bx - sx * bz, pbz = sx * by - sy * bx;
    mapInto(sx, sy, sz, ax, ay, az, VW, 0); mapInto(sx, sy, sz, bx, by, bz, VW, 2);
    mapInto(pax, pay, paz, ax, ay, az, VW, 4); mapInto(pbx, pby, pbz, bx, by, bz, VW, 6);
    out[0] = 0.5 * (VW[0] * VW[2] + VW[1] * VW[3]); out[1] = 0.5 * (VW[4] * VW[6] + VW[5] * VW[7]);
    return out;
  }
  function vectorWeights(a, b) {
    const B = scatterBasis(a, b);
    const s1 = mapT(B.s, a), s2 = mapT(B.s, b), p1 = mapT(B.pa, a), p2 = mapT(B.pb, b);
    return [0.5 * (s1[0] * s2[0] + s1[1] * s2[1]), 0.5 * (p1[0] * p2[0] + p1[1] * p2[1])];
  }
  function transmittedKernel(cfg) {
    const q = cfg.q_per_um, nq = q.length;
    need(cfg.z_hi > cfg.z_lo, "z range empty");
    const spectrum = cfg.spectrum_override || sampleSpectrum(cfg.source, cfg.z_hi - cfg.z_lo);
    const naO0 = cfg.na_obj, ill = cfg.illum;
    need(ill && ill.na_out > 0 && ill.na_in >= 0 && ill.na_in < ill.na_out, "illumination aperture missing");
    const pupil = cfg.pupil || { kind: "none" };
    const ND = pupil.kind === "dic" ? 8 : 1;                    // directions of q in [0, pi)
    const dirs = []; for (let j = 0; j < ND; j++) dirs.push(Math.PI * j / ND);
    // |Delta| = |kz_in - kz_out| <= k (1 - cos theta_max) over illumination and collection cones
    let dmax = 0;
    for (const sp of spectrum) {
      const nm = liquidIndex(cfg.liquid, sp.l), k = TWO_PI * nm / sp.l;
      const so = Math.min(0.999, Math.min(naO0, nm) / nm), sc = Math.min(0.999, Math.min(ill.na_out, nm) / nm);
      dmax = Math.max(dmax, k * (1 - Math.sqrt(1 - Math.max(so, sc) * Math.max(so, sc))));
    }
    dmax = Math.max(dmax * 1.3, 1e-3);
    const dz = cfg.dz_um || Math.min(0.5, 0.8 * Math.PI / dmax);
    const zmax = Math.max(Math.abs(cfg.z_lo), Math.abs(cfg.z_hi));
    let NF = 256; while (NF * dz < 8 * zmax + 4) NF *= 2;
    need(NF <= 65536, "cell too thick for the axial sampling");
    const dD = TWO_PI / (NF * dz);                      // histogram bin over Delta
    const iz0 = Math.round(cfg.z_lo / dz), iz1 = Math.round(cfg.z_hi / dz), nz = iz1 - iz0 + 1;
    const z = new Float64Array(nz); for (let i = 0; i < nz; i++) z[i] = (iz0 + i) * dz;
    const Kr = new Float64Array(ND * nq * nz), Ki = new Float64Array(ND * nq * nz);
    const tb = FFT.tables(NF), hr = new Float64Array(NF), hi = new Float64Array(NF);
    let bg = 0, inc = 0, Cext = 0, Csca = 0, wtot = 0;

    // illumination mesh in direction cosines (NA units): disk or annulus
    const nmax = 0.999 * liquidIndex(cfg.liquid, spectrum[0].l);
    const rIn = Math.min(ill.na_in, nmax), rOut = Math.min(ill.na_out, nmax);
    need(rOut > rIn, "illumination annulus lies beyond what the liquid can carry");
    const disk = rIn < 1e-6, point = disk && rOut < 1e-4;
    const Nr = point ? 0 : Math.max(4, Math.min(28, Math.ceil(24 * (rOut - rIn) / 0.3)));
    const Nphi = point ? 1 : (disk ? 64 : 96);
    const vx = [], vy = [];
    const rad = function (j) { return rIn + (rOut - rIn) * j / Nr; };
    if (disk) { vx.push(0); vy.push(0); }
    for (let j = disk ? 1 : 0; j <= Nr; j++) for (let i = 0; i < Nphi; i++) { const r = rad(j), a = TWO_PI * (i + 0.5 * (j % 2)) / Nphi; vx.push(r * Math.cos(a)); vy.push(r * Math.sin(a)); }
    const tri = [];   // [a, b, c, area]
    const vid = function (j, i) { const ii = ((i % Nphi) + Nphi) % Nphi; return disk ? (j === 0 ? 0 : 1 + (j - 1) * Nphi + ii) : j * Nphi + ii; };
    const area = function (a, b, c) { return 0.5 * Math.abs((vx[b] - vx[a]) * (vy[c] - vy[a]) - (vx[c] - vx[a]) * (vy[b] - vy[a])); };
    for (let j = 0; j < Nr; j++) for (let i = 0; i < Nphi; i++) {
      if (disk && j === 0) { const a = 0, b = vid(1, i), c = vid(1, i + 1); tri.push([a, b, c, area(a, b, c)]); }
      else {
        const a = vid(j, i), b = vid(j + 1, i), c = vid(j + 1, i + 1), d = vid(j, i + 1);
        tri.push([a, b, c, area(a, b, c)]); tri.push([a, c, d, area(a, c, d)]);
      }
    }
    if (point) { vx.push(0); vy.push(0); tri.push([0, 0, 0, 1]); }
    const AT = tri.reduce(function (s, t) { return s + t[3]; }, 0);
    tri.forEach(function (t) { t[3] /= AT; });
    const NV = vx.length;
    const ar = new Float64Array(2 * NV), ai = new Float64Array(2 * NV), dl = new Float64Array(2 * NV);

    function deposit(d1, d2, d3, wr, wi) {
      if (d1 > d2) { const t = d1; d1 = d2; d2 = t; } if (d2 > d3) { const t = d2; d2 = d3; d3 = t; } if (d1 > d2) { const t = d1; d1 = d2; d2 = t; }
      const off = NF / 2, span = d3 - d1;
      if (span < 1e-6 * dD) { const j = Math.round(d1 / dD) + off; if (j >= 0 && j < NF) { hr[j] += wr; hi[j] += wi; } return; }
      const F = function (x) {
        if (x <= d1) return 0; if (x >= d3) return 1;
        if (x <= d2) return (d2 > d1) ? (x - d1) * (x - d1) / (span * (d2 - d1)) : 0;
        return (d3 > d2) ? 1 - (d3 - x) * (d3 - x) / (span * (d3 - d2)) : 1;
      };
      const j0 = Math.round(d1 / dD), j1 = Math.round(d3 / dD);
      let prev = 0;
      for (let j = j0; j <= j1; j++) {
        const cur = F((j + 0.5) * dD), m = cur - prev; prev = cur;
        const jj = j + off; if (m !== 0 && jj >= 0 && jj < NF) { hr[jj] += wr * m; hi[jj] += wi * m; }
      }
    }

    const NMU = 2001, GW = new Float64Array(2);
    const mieTabs = spectrum.map(function (sp) {
      const nm = liquidIndex(cfg.liquid, sp.l), np = particleIndex(cfg.particle, sp.l), k0 = TWO_PI / sp.l, k = k0 * nm;
      const naO = Math.min(naO0, nm * 0.999);
      const thMax = Math.min(Math.PI, Math.asin(Math.min(1, naO / nm)) + Math.asin(Math.min(1, rOut / nm)));
      const muMin = Math.max(-1, Math.cos(thMax) - 1e-6);
      const mus = new Float64Array(NMU); for (let i = 0; i < NMU; i++) mus[i] = muMin + (1 - muMin) * i / (NMU - 1);
      const M = mie(np / nm, 0, k * cfg.diameter_um / 2, mus);
      Cext += sp.w * M.Qext * Math.PI * cfg.diameter_um * cfg.diameter_um / 4;
      Csca += sp.w * M.Qsca * Math.PI * cfg.diameter_um * cfg.diameter_um / 4;
      const vec = !cfg.scalar;
      const S1r = Float64Array.from(M.S1r), S1i = Float64Array.from(M.S1i), S2r = Float64Array.from(M.S2r), S2i = Float64Array.from(M.S2i);
      if (!vec) for (let i = 0; i < NMU; i++) { S1r[i] = S2r[i] = 0.5 * (M.S1r[i] + M.S2r[i]); S1i[i] = S2i[i] = 0.5 * (M.S1i[i] + M.S2i[i]); }
      return { nm: nm, k0: k0, k: k, naO: naO, muMin: muMin, S1r: S1r, S1i: S1i, S2r: S2r, S2i: S2i, w: sp.w, vec: vec, ab: aberrationFor(cfg.aberration, nm, naO, k0) };
    });
    // per wavelength and illumination direction: kz, inside the objective's aperture, and the input pupil factor
    for (const T of mieTabs) {
      T.kiz = new Float64Array(NV); T.inb = new Uint8Array(NV); T.Pir = new Float64Array(NV); T.Pii = new Float64Array(NV);
      const k = T.k, k0 = T.k0, pupil2 = (k0 * T.naO) * (k0 * T.naO);
      for (let v = 0; v < NV; v++) {
        const kix = k0 * vx[v], kiy = k0 * vy[v], kiz = Math.sqrt(k * k - kix * kix - kiy * kiy);
        const pmi = pupilAt(pupil, T.ab, kix, kiy, k0), ap = Math.sqrt(kiz / k);
        T.kiz[v] = kiz; T.inb[v] = (kix * kix + kiy * kiy) <= pupil2 ? 1 : 0; T.Pir[v] = ap * pmi[0]; T.Pii[v] = ap * pmi[1];
      }
    }
    // direct light reaching the camera (background) and incident light (for dark field)
    for (const T of mieTabs) {
      const pv = new Float64Array(NV), iv = new Float64Array(NV);
      for (let v = 0; v < NV; v++) {
        const u2 = vx[v] * vx[v] + vy[v] * vy[v], c = Math.sqrt(Math.max(0, 1 - u2 / (T.nm * T.nm)));
        const pm = pupilMask(pupil, T.k0 * vx[v], T.k0 * vy[v], T.k0);
        iv[v] = c; pv[v] = (Math.sqrt(u2) <= T.naO) ? c * (pm[0] * pm[0] + pm[1] * pm[1]) : 0;
      }
      for (const t of tri) { bg += T.w * t[3] * (pv[t[0]] + pv[t[1]] + pv[t[2]]) / 3; inc += T.w * t[3] * (iv[t[0]] + iv[t[1]] + iv[t[2]]) / 3; }
      wtot += T.w;
    }
    const dark = bg < 1e-6 * inc;
    const norm = dark ? inc : bg;

    // DIC: the optics is symmetric under reflection across the shear direction, so K at the mirrored direction is
    // the same (or its complex conjugate, when the mirror falls outside [0, pi): K(-q) = conj K(q))
    const mirror = new Int32Array(ND).fill(-1), mirConj = new Uint8Array(ND);
    if (pupil.kind === "dic" && !cfg.no_mirror) for (let d = 0; d < ND; d++) {
      let th = 2 * pupil.angle - dirs[d]; th = ((th % TWO_PI) + TWO_PI) % TWO_PI;
      let cj = 0; if (th >= Math.PI - 1e-9) { th -= Math.PI; cj = 1; }
      const j = Math.round(th / (Math.PI / ND));
      if (Math.abs(th - j * Math.PI / ND) < 1e-9 && j % ND < d) { mirror[d] = j % ND; mirConj[d] = cj; }
    }
    if (!dark && !cfg.homodyne_only) for (let d = 0; d < ND; d++) {
      if (mirror[d] >= 0) {
        const md = mirror[d], sgn = mirConj[d] ? -1 : 1;
        for (let iq = 0; iq < nq; iq++) for (let i = 0; i < nz; i++) { const o = (d * nq + iq) * nz + i, os = (md * nq + iq) * nz + i; Kr[o] = Kr[os]; Ki[o] = sgn * Ki[os]; }
        continue;
      }
      const cq = Math.cos(dirs[d]), sq = Math.sin(dirs[d]);
      for (let iq = 0; iq < nq; iq++) {
        hr.fill(0); hi.fill(0);
        for (const T of mieTabs) {
          const k = T.k, k0 = T.k0, pupil2 = (k0 * T.naO) * (k0 * T.naO);
          for (let v = 0; v < NV; v++) {
            const kix = k0 * vx[v], kiy = k0 * vy[v], kiz = T.kiz[v], inb = T.inb[v] === 1, Pir = T.Pir[v], Pii = T.Pii[v];
            for (let sg = 0; sg < 2; sg++) {
              const s1 = sg === 0 ? 1 : -1, kx = kix + s1 * q[iq] * cq, ky = kiy + s1 * q[iq] * sq, kt2 = kx * kx + ky * ky, id = 2 * v + sg;
              if (!inb || kt2 > pupil2) { ar[id] = 0; ai[id] = 0; dl[id] = 0; continue; }
              const kz = Math.sqrt(k * k - kt2), apo = Math.sqrt(kz / k), pmo = pupilAt(pupil, T.ab, kx, ky, k0), Por = apo * pmo[0], Poi = apo * pmo[1];
              const mu = (kix * kx + kiy * ky + kiz * kz) / (k * k);
              let tt = (mu - T.muMin) / (1 - T.muMin) * (NMU - 1); if (tt < 0) tt = 0; if (tt > NMU - 1) tt = NMU - 1;
              const i = Math.min(NMU - 2, Math.floor(tt)), f = tt - i;
              const G = T.vec ? vectorWeightsInto(kix / k, kiy / k, kiz / k, kx / k, ky / k, kz / k, GW) : HALF2;
              const S1r = T.S1r[i] + f * (T.S1r[i + 1] - T.S1r[i]), S1i = T.S1i[i] + f * (T.S1i[i + 1] - T.S1i[i]);
              const S2r = T.S2r[i] + f * (T.S2r[i + 1] - T.S2r[i]), S2i = T.S2i[i] + f * (T.S2i[i + 1] - T.S2i[i]);
              const Sr = G[0] * S1r + G[1] * S2r, Si = G[0] * S1i + G[1] * S2i;
              const amp = -(TWO_PI / k) / kz * T.w;
              if (sg === 0) {   // conj(P_in) P_out S e^{+i Delta z}
                const Cr = Pir * Por + Pii * Poi, Ci = Pir * Poi - Pii * Por;
                ar[id] = amp * (Cr * Sr - Ci * Si); ai[id] = amp * (Cr * Si + Ci * Sr); dl[id] = kiz - kz;
              } else {          // P_in conj(P_out) conj(S) e^{-i Delta z}
                const Cr = Pir * Por + Pii * Poi, Ci = Pii * Por - Pir * Poi;
                ar[id] = amp * (Cr * Sr + Ci * Si); ai[id] = amp * (Ci * Sr - Cr * Si); dl[id] = -(kiz - kz);
              }
            }
          }
          for (const t of tri) for (let sg = 0; sg < 2; sg++) {
            const a = 2 * t[0] + sg, b = 2 * t[1] + sg, c = 2 * t[2] + sg;
            const wr = (ar[a] + ar[b] + ar[c]) / 3 * t[3], wi = (ai[a] + ai[b] + ai[c]) / 3 * t[3];
            if (wr === 0 && wi === 0) continue;
            deposit(dl[a], dl[b], dl[c], wr, wi);
          }
        }
        for (let j = 1; j < NF; j += 2) { hr[j] = -hr[j]; hi[j] = -hi[j]; }
        FFT.fft1(hr, hi, tb, +1);
        for (let i = 0; i < nz; i++) {
          const m = iz0 + i + NF / 2, sgn = (m & 1) ? -1 : 1;
          const u = Math.PI * z[i] / (NF * dz), corr = Math.abs(u) < 1e-9 ? 1 : u / Math.sin(u);   // undo bin averaging
          const o = (d * nq + iq) * nz + i;
          Kr[o] = sgn * hr[m] * corr / norm; Ki[o] = sgn * hi[m] * corr / norm;
        }
      }
    }
    const out = { Kr: Kr, Ki: Ki, nd: ND, dirs: dirs, z_um: z, dz_um: dz, Cext_um2: Cext / wtot, Csca_um2: Csca / wtot, background: bg / wtot, incident: inc / wtot, dark: dark, spectrum: spectrum, mesh_triangles: tri.length };
    need(cfg.homodyne || cfg.homodyne_only || !dark, "dark field needs the scattered-intensity term");
    if (cfg.homodyne || cfg.homodyne_only) addHomodyne(cfg, spectrum, out, norm, z, { rIn: rIn, rOut: rOut, disk: disk, point: point }, pupil, dirs);
    return out;
  }
  // bright field with a disk-shaped condenser aperture (rotationally symmetric, real kernel)
  function brightFieldKernel(cfg) {
    const o = transmittedKernel(Object.assign({}, cfg, { illum: { na_in: 0, na_out: Math.max(cfg.na_cond, 1e-5) }, pupil: { kind: "none" } }));
    let mx = 0, mi = 0; for (let i = 0; i < o.Kr.length; i++) { mx = Math.max(mx, Math.abs(o.Kr[i])); mi = Math.max(mi, Math.abs(o.Ki[i])); }
    o.K = o.Kr; o.imag_ratio = mx > 0 ? mi / mx : 0;
    return o;
  }
  // depth grid that is fine near focus and coarser far from it (spacing proportional to distance)
  function depthGrid(zlo, zhi, df, Zf, rel) {
    const pts = [], step = function (z) { return Math.abs(z) < Zf ? df : Math.max(df, rel * Math.abs(z)); };
    if (zlo <= 0 && zhi >= 0) { for (let z = 0; z <= zhi; z += step(z)) pts.push(z); for (let z = -step(0); z >= zlo; z -= step(z)) pts.push(z); }
    else if (zlo > 0) { for (let z = zlo; z <= zhi; z += step(z)) pts.push(z); }
    else { for (let z = zhi; z >= zlo; z -= step(z)) pts.push(z); }
    pts.push(zlo, zhi); pts.sort(function (p, q) { return p - q; });
    return Float64Array.from(pts.filter(function (v, k) { return k === 0 || v - pts[k - 1] > 1e-9; }));
  }
  // wavelength sampling dense enough that the spectrum average does not revive within the cell
  function sampleSpectrum(key, thickness_um) {
    need(SOURCES[key], "unknown light source " + key);
    const base = SOURCES[key].sample();
    if (base.length === 1) return base;
    const lmin = Math.min.apply(null, base.map(function (p) { return p.l; })), lmax = Math.max.apply(null, base.map(function (p) { return p.l; }));
    const n = Math.min(64, Math.max(base.length, Math.ceil(2 * (lmax - lmin) / lmin * 2.5 * thickness_um / 1.5)));
    if (n <= base.length) return base;
    return SOURCES[key].dense(n);
  }
  // scattered-intensity term |E_s|^2: per (illumination direction, wavelength, depth) the scattered field is
  // built on a grid of plane waves, squared in real space and transformed back. For rotationally symmetric
  // pupils one illumination direction per radius is enough (the result is averaged over angle anyway);
  // DIC needs several directions per radius and keeps the angle dependence. Coarser sampling than the
  // interference term (central wavelength, depth grid fine near focus), interpolated in depth.
  function addHomodyne(cfg, spectrum, out, norm, z, ill, pupil, dirs) {
    const q = cfg.q_per_um, nq = q.length, nz = z.length, ND = dirs.length, aniso = pupil.kind === "dic";
    const G = 128;
    let kp = 0;
    for (const sp of spectrum) { const nm0 = liquidIndex(cfg.liquid, sp.l); kp = Math.max(kp, TWO_PI / sp.l * Math.min(cfg.na_obj, nm0 * 0.999)); }
    const dk = 4.2 * kp / G, Lbox = TWO_PI / dk;
    const tb = FFT.tables(G), work = FFT.work(G);
    const re = new Float64Array(G * G), im = new Float64Array(G * G), II = new Float64Array(G * G);
    const lam = spectrum.length > 3 ? [spectrum[Math.floor(spectrum.length / 2)]] : spectrum;
    const wsum = lam.reduce(function (s, p) { return s + p.w; }, 0);
    // illumination radii (equal-area points across the disk or annulus) and directions per radius
    const radii = ill.point ? [0] : [0, 1, 2].map(function (i) { const a2 = ill.rIn * ill.rIn, b2 = ill.rOut * ill.rOut; return Math.sqrt(a2 + (b2 - a2) * (i + 0.5) / 3); });
    const NA_ = aniso && !ill.point ? 6 : 1;
    const zc = depthGrid(z[0], z[nz - 1], 0.5, 8, 0.1);
    need(zc.length <= 400, "cell too thick for the scattered-intensity term");
    const NZH = zc.length;
    const Hr = new Float64Array(ND * nq * NZH), Hi = new Float64Array(ND * nq * NZH);
    for (const sp of lam) {
      const l0 = sp.l, nm = liquidIndex(cfg.liquid, l0), np = particleIndex(cfg.particle, l0);
      const k0 = TWO_PI / l0, k = k0 * nm, naO = Math.min(cfg.na_obj, nm * 0.999), x = k * cfg.diameter_um / 2;
      for (const r0 of radii) for (let ia = 0; ia < NA_; ia++) {
        const phi0 = TWO_PI * ia / NA_, wsrc = (sp.w / wsum) / (radii.length * NA_);
        const kix = k0 * r0 * Math.cos(phi0), kiy = k0 * r0 * Math.sin(phi0), kiz = Math.sqrt(k * k - kix * kix - kiy * kiy);
        const mus = [], idx = [], pmr = [], pmi = [], geo = [];
        const A = aberrationFor(cfg.aberration, nm, naO, k0), vec = !cfg.scalar, a = [kix / k, kiy / k, kiz / k];
        // two polarisations of the incident light, normal to a
        const st0 = Math.hypot(a[0], a[1]), cp0 = st0 > 1e-12 ? a[0] / st0 : 1, sp0 = st0 > 1e-12 ? a[1] / st0 : 0;
        const pol = [[a[2] * cp0, a[2] * sp0, -st0], [-sp0, cp0, 0]];
        for (let iy = 0; iy < G; iy++) for (let ix = 0; ix < G; ix++) {
          const kx = (ix < G / 2 ? ix : ix - G) * dk, ky = (iy < G / 2 ? iy : iy - G) * dk, kt2 = kx * kx + ky * ky;
          if (kt2 > (k0 * naO) * (k0 * naO)) continue;
          const kz = Math.sqrt(k * k - kt2), pm = pupilAt(pupil, A, kx, ky, k0);
          mus.push((kix * kx + kiy * ky + kiz * kz) / (k * k)); idx.push(iy * G + ix); pmr.push(pm[0]); pmi.push(pm[1]);
          // per polarisation e and camera component c: field = S2 * alpha + S1 * beta
          const b = [kx / k, ky / k, kz / k], g = new Float64Array(8);
          if (vec) {
            const B = scatterBasis(a, b), Ms = mapT(B.s, b), Mp = mapT(B.pb, b);
            for (let e = 0; e < 2; e++) {
              const ep = pol[e][0] * B.pa[0] + pol[e][1] * B.pa[1] + pol[e][2] * B.pa[2], es = pol[e][0] * B.s[0] + pol[e][1] * B.s[1] + pol[e][2] * B.s[2];
              for (let c = 0; c < 2; c++) { g[4 * e + 2 * c] = ep * Mp[c]; g[4 * e + 2 * c + 1] = es * Ms[c]; }
            }
          } else { g[0] = g[1] = 0.5; g[6] = g[7] = 0.5; }   // scalar: (S1 + S2) / 2 in one component per polarisation
          geo.push(g);
        }
        const M = mie(np / nm, 0, x, Float64Array.from(mus));
        const sc = dk * dk;
        for (let iz = 0; iz < NZH; iz++) {
          II.fill(0);
          for (let e = 0; e < 2; e++) for (let c = 0; c < 2; c++) {
            re.fill(0); im.fill(0);
            const o1 = 4 * e + 2 * c;
            let any = false;
            for (let j = 0; j < idx.length; j++) {
              const g = geo[j], al = g[o1], be = g[o1 + 1];
              if (al === 0 && be === 0) continue;
              any = true;
              const p = idx[j], ix = p % G, iy = (p - ix) / G;
              const kx = (ix < G / 2 ? ix : ix - G) * dk, ky = (iy < G / 2 ? iy : iy - G) * dk;
              const kz = Math.sqrt(k * k - kx * kx - ky * ky), P = Math.sqrt(kz / k);
              const Sr = al * M.S2r[j] + be * M.S1r[j], Si = al * M.S2i[j] + be * M.S1i[j];
              const amp = -(1 / (TWO_PI * k)) * P / kz;
              const ph = (kiz - kz) * zc[iz], cc = Math.cos(ph), ss = Math.sin(ph);
              const br = amp * (Sr * cc - Si * ss), bi = amp * (Sr * ss + Si * cc);
              re[p] = br * pmr[j] - bi * pmi[j]; im[p] = br * pmi[j] + bi * pmr[j];
            }
            if (!any) continue;
            FFT.fft2(re, im, G, tb, work, +1);
            for (let p = 0; p < G * G; p++) { const u = re[p] * sc, v = im[p] * sc; II[p] += 0.5 * (u * u + v * v); }
          }
          for (let p = 0; p < G * G; p++) { re[p] = II[p]; im[p] = 0; }
          FFT.fft2(re, im, G, tb, work, -1);
          const dx2 = (Lbox / G) * (Lbox / G);
          if (!aniso) {
            const NB = G / 2 + 1, acc = new Float64Array(NB), cnt = new Float64Array(NB);
            for (let iy = 0; iy < G; iy++) for (let ix = 0; ix < G; ix++) {
              const b = Math.round(Math.hypot(ix < G / 2 ? ix : ix - G, iy < G / 2 ? iy : iy - G));
              if (b < NB) { acc[b] += re[iy * G + ix] * dx2; cnt[b]++; }
            }
            for (let b = 0; b < NB; b++) acc[b] = cnt[b] > 0 ? acc[b] / cnt[b] : 0;
            for (let iq = 0; iq < nq; iq++) { const t = q[iq] / dk; if (t >= NB - 1) continue; const b = Math.floor(t), f = t - b; Hr[iq * NZH + iz] += wsrc * (acc[b] + f * (acc[b + 1] - acc[b])); }
          } else {
            // sample along each direction (bilinear in the 2D transform, complex)
            for (let d = 0; d < ND; d++) for (let iq = 0; iq < nq; iq++) {
              const fx = q[iq] * Math.cos(dirs[d]) / dk, fy = q[iq] * Math.sin(dirs[d]) / dk;
              if (Math.abs(fx) >= G / 2 - 1 || Math.abs(fy) >= G / 2 - 1) continue;
              const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
              let vr = 0, vi = 0;
              for (let ddy = 0; ddy < 2; ddy++) for (let ddx = 0; ddx < 2; ddx++) {
                const w = (ddx ? tx : 1 - tx) * (ddy ? ty : 1 - ty), ix = ((x0 + ddx) % G + G) % G, iy = ((y0 + ddy) % G + G) % G;
                vr += w * re[iy * G + ix]; vi += w * im[iy * G + ix];
              }
              const o = (d * nq + iq) * NZH + iz; Hr[o] += wsrc * vr * dx2; Hi[o] += wsrc * vi * dx2;
            }
          }
        }
      }
    }
    // add (normalised) with depth interpolation onto the kernel grid
    let hmax = 0;
    for (let d = 0; d < ND; d++) for (let iq = 0; iq < nq; iq++) {
      const src = aniso ? d : 0;
      for (let iz = 0; iz < nz; iz++) {
        let lo = 0, hi = NZH - 1;
        if (NZH === 1) hi = 0; else if (z[iz] <= zc[0]) hi = 1; else if (z[iz] >= zc[hi]) lo = hi - 1; else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (zc[mid] <= z[iz]) lo = mid; else hi = mid; }
        const f = NZH === 1 ? 0 : Math.max(0, Math.min(1, (z[iz] - zc[lo]) / (zc[hi] - zc[lo])));
        const b0 = (src * nq + iq) * NZH;
        const vr = NZH === 1 ? Hr[b0] : Hr[b0 + lo] + f * (Hr[b0 + hi] - Hr[b0 + lo]);
        const vi = NZH === 1 ? Hi[b0] : Hi[b0 + lo] + f * (Hi[b0 + hi] - Hi[b0 + lo]);
        const o = (d * nq + iq) * nz + iz;
        out.Kr[o] += vr / norm; out.Ki[o] += vi / norm; hmax = Math.max(hmax, Math.abs(vr / norm));
      }
    }
    out.homodyne_max = hmax;
  }

  // ---- non-spherical and birefringent particles ---------------------------------------------
  /* Shapes (size = largest dimension, p = aspect ratio >= 1, axis u = symmetry axis):
   *   sphere, bisphere (sphere of a uniaxial birefringent material, optic axis u),
   *   prolate (spheroid, long axis u), oblate (spheroid, short axis u), rod (cylinder of length size, diameter size / p).
   * Optics in the dipole / Rayleigh-Gans picture: each volume element scatters with the polarizability
   * tensor alpha = alpha_perp I + (alpha_par - alpha_perp) u u, alpha_i = V (m_i^2 - 1) / (1 + L_i (m_i^2 - 1))
   * (relative to the liquid; L = depolarisation factors: shape or form birefringence; m_par includes the
   * material birefringence). Exact for small or weakly scattering particles, approximate otherwise. */
  function shapeGeometry(shape, size, p) {
    need(size > 0, "particle size must be positive");
    if (shape === "sphere" || shape === "bisphere") return { kind: "spheroid", a_par: size / 2, a_perp: size / 2, volume: Math.PI * size * size * size / 6, p: 1 };
    need(p >= 1, "aspect ratio must be at least 1");
    if (shape === "prolate") { const a = size / 2, b = a / p; return { kind: "spheroid", a_par: a, a_perp: b, volume: 4 / 3 * Math.PI * a * b * b, p: p }; }
    if (shape === "oblate") { const b = size / 2, a = b / p; return { kind: "spheroid", a_par: a, a_perp: b, volume: 4 / 3 * Math.PI * a * b * b, p: p }; }
    if (shape === "rod") { need(p >= 2 && p <= 30, "rods need an aspect ratio between 2 and 30 (hydrodynamic formulas)"); const R = size / (2 * p); return { kind: "cylinder", a_par: size / 2, a_perp: R, volume: Math.PI * R * R * size, p: p }; }
    fail("unknown particle shape " + shape);
  }
  // depolarisation factors [L_par, L_perp] (Bohren and Huffman 5.33, 5.34); rods as prolate spheroids of the same aspect ratio
  function depolarization(shape, p) {
    if (shape === "sphere" || shape === "bisphere" || p < 1 + 1e-6) return [1 / 3, 1 / 3];
    const e = Math.sqrt(1 - 1 / (p * p));
    if (shape === "prolate" || shape === "rod") { const Lp = (1 - e * e) / (e * e) * (Math.log((1 + e) / (1 - e)) / (2 * e) - 1); return [Lp, (1 - Lp) / 2]; }
    if (shape === "oblate") { const g = Math.sqrt((1 - e * e) / (e * e)), L1 = g / (2 * e * e) * (Math.PI / 2 - Math.atan(g)) - g * g / 2; return [1 - 2 * L1, L1]; }
    fail("unknown particle shape " + shape);
  }
  function polarizability(V, m, L) { const e = m * m - 1; return V * e / (1 + L * e); }
  // form factor F(Q) / F(0) for wave-vector components along and across the axis
  function formFactor(geo, Qpar, Qperp) {
    if (geo.kind === "spheroid") {
      const x = Math.sqrt(Math.pow(geo.a_par * Qpar, 2) + Math.pow(geo.a_perp * Qperp, 2));
      if (x < 1e-3) return 1 - x * x / 10;
      return 3 * (Math.sin(x) - x * Math.cos(x)) / (x * x * x);
    }
    const u = Qpar * geo.a_par, v = Qperp * geo.a_perp;
    const sinc = Math.abs(u) < 1e-6 ? 1 : Math.sin(u) / u, jinc = Math.abs(v) < 1e-6 ? 1 : 2 * besselJ1(v) / v;
    return sinc * jinc;
  }
  /* Diffusion coefficients (stick boundary, bulk liquid; walls neglected). kT in J, eta in Pa s, lengths um.
   * Spheroids: Perrin friction coefficients (as in Koenig, Biopolymers 14, 2421 (1975)).
   * Cylinders: Tirado, Martinez and Garcia de la Torre, J. Chem. Phys. 81, 2047 (1984), valid for 2 <= p <= 30.
   * Returns D_par, D_perp (translation along and across the axis), D_t = (D_par + 2 D_perp) / 3 (um^2/s)
   * and D_r (tumbling, rad^2/s; the axis decorrelates as < P2(u(t) . u(0)) > = exp(-6 D_r t)). */
  function hydrodynamics(geo, kT, eta) {
    const um = 1e-6;
    let fpar, fperp, frot;
    const a = geo.a_par * um, b = geo.a_perp * um;
    if (geo.kind === "spheroid" && Math.abs(a - b) < 1e-6 * b) { fpar = fperp = 6 * Math.PI * eta * a; frot = 8 * Math.PI * eta * a * a * a; }
    else if (geo.kind === "spheroid") {
      const S = a > b ? 2 / Math.sqrt(a * a - b * b) * Math.log((a + Math.sqrt(a * a - b * b)) / b) : 2 / Math.sqrt(b * b - a * a) * Math.atan(Math.sqrt(b * b - a * a) / a);
      fpar = 16 * Math.PI * eta * (a * a - b * b) / ((2 * a * a - b * b) * S - 2 * a);
      fperp = 32 * Math.PI * eta * (a * a - b * b) / ((2 * a * a - 3 * b * b) * S + 2 * a);
      frot = 32 * Math.PI * eta * (a * a * a * a - b * b * b * b) / (3 * ((2 * a * a - b * b) * S - 2 * a));
    } else {
      const L = 2 * a, p = geo.p, lp = Math.log(p);
      const Dpar = kT * (lp - 0.207 + 0.980 / p - 0.133 / (p * p)) / (2 * Math.PI * eta * L);
      const Dperp = kT * (lp + 0.839 + 0.185 / p + 0.233 / (p * p)) / (4 * Math.PI * eta * L);
      const Dr = 3 * kT * (lp - 0.662 + 0.917 / p - 0.050 / (p * p)) / (Math.PI * eta * L * L * L);
      return { D_par: Dpar * 1e12, D_perp: Dperp * 1e12, D_t: (Dpar + 2 * Dperp) / 3 * 1e12, D_r: Dr };
    }
    const Dpar = kT / fpar * 1e12, Dperp = kT / fperp * 1e12;
    return { D_par: Dpar, D_perp: Dperp, D_t: (Dpar + 2 * Dperp) / 3, D_r: kT / frot };
  }
  /* Polarisers (paraxial): illumination polariser at angle P (or unpolarised light), analyser at angle A (or none),
   * analyser extinction: a crossed pair passes the share 'extinction' of the light (incoherent leak).
   * For a particle with in-plane axis projection (tx, ty) and polarisabilities alpha_perp, dalpha = alpha_par - alpha_perp:
   *   het: interference with the direct light, sum over inputs of t_P (e_A . alpha . e_P)   [t_P = e_A . e_P]
   *   hom: scattered intensity, sum over inputs of |e_A . alpha . e_P|^2 (no analyser: |alpha e_P|^2)
   *   bg:  direct light reaching the camera, relative to no polarisers. */
  function polarizerInputs(pol) {
    if (pol && pol.polarizer_deg !== null && pol.polarizer_deg !== undefined) { const t = pol.polarizer_deg * Math.PI / 180; return [{ x: Math.cos(t), y: Math.sin(t), w: 1 }]; }
    return [{ x: 1, y: 0, w: 0.5 }, { x: 0, y: 1, w: 0.5 }];
  }
  function polCoeffs(pol, aPerp, dA, tx, ty) {
    const ins = polarizerInputs(pol), hasA = pol && pol.analyzer_deg !== null && pol.analyzer_deg !== undefined;
    let het = 0, hom = 0, bg = 0;
    const ax = hasA ? Math.cos(pol.analyzer_deg * Math.PI / 180) : 0, ay = hasA ? Math.sin(pol.analyzer_deg * Math.PI / 180) : 0;
    for (const e of ins) {
      const te = tx * e.x + ty * e.y;
      if (hasA) {
        const tP = ax * e.x + ay * e.y, ta = tx * ax + ty * ay, s = aPerp * tP + dA * ta * te;
        het += e.w * tP * s; hom += e.w * s * s; bg += e.w * tP * tP;
      } else {
        const sx = aPerp * e.x + dA * tx * te, sy = aPerp * e.y + dA * ty * te;
        het += e.w * (e.x * sx + e.y * sy); hom += e.w * (sx * sx + sy * sy); bg += e.w;
      }
    }
    if (hasA) bg += pol.extinction || 0;
    return { het: het, hom: hom, bg: bg };
  }
  /* Brightness factor of the scattered intensity, <|F(Q)|^2> over illumination and collection directions,
   * as a function of the tilt theta of the axis from the optical axis (azimuthal symmetry of both apertures).
   * Direction sines in the liquid: objective s_obj, illumination annulus [s_in, s_out]; k in the liquid. */
  function brightnessTable(geo, k, s_obj, s_in, s_out, nth) {
    const out = new Float64Array(nth), NP = 900;
    let seed = 12345; const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pairs = [];
    for (let j = 0; j < NP; j++) {
      const ri = Math.sqrt(s_in * s_in + (s_out * s_out - s_in * s_in) * rnd()), pi_ = TWO_PI * rnd();
      const ro = s_obj * Math.sqrt(rnd()), po = TWO_PI * rnd(), pu = TWO_PI * rnd();
      const ix = ri * Math.cos(pi_), iy = ri * Math.sin(pi_), iz = Math.sqrt(Math.max(0, 1 - ri * ri));
      const ox = ro * Math.cos(po), oy = ro * Math.sin(po), oz = Math.sqrt(Math.max(0, 1 - ro * ro));
      pairs.push([k * (ox - ix), k * (oy - iy), k * (oz - iz), pu]);
    }
    for (let t = 0; t < nth; t++) {
      const th = (Math.PI / 2) * t / (nth - 1), st = Math.sin(th), ct = Math.cos(th);
      let acc = 0;
      for (const P of pairs) {
        const ux = st * Math.cos(P[3]), uy = st * Math.sin(P[3]), uz = ct;
        const Qpar = P[0] * ux + P[1] * uy + P[2] * uz, Q2 = P[0] * P[0] + P[1] * P[1] + P[2] * P[2];
        const F = formFactor(geo, Qpar, Math.sqrt(Math.max(0, Q2 - Qpar * Qpar)));
        acc += F * F;
      }
      out[t] = acc / NP;
    }
    return out;
  }
  /* Points filling the body (body frame: [along the axis, across, across]), on a lattice of spacing <= s,
   * at most maxPts points (the spacing grows if needed). Each point stands for an equal share of the volume. */
  function bodyPoints(geo, s, maxPts) {
    let sp = s;
    for (let iter = 0; iter < 60; iter++) {
      const npar = Math.max(1, Math.round(2 * geo.a_par / sp)), nper = Math.max(1, Math.round(2 * geo.a_perp / sp));
      const pts = [];
      for (let i = 0; i < npar; i++) for (let j = 0; j < nper; j++) for (let l = 0; l < nper; l++) {
        const x = geo.a_par * (-1 + (2 * i + 1) / npar), y = geo.a_perp * (-1 + (2 * j + 1) / nper), z = geo.a_perp * (-1 + (2 * l + 1) / nper);
        const r2 = (y * y + z * z) / (geo.a_perp * geo.a_perp);
        const inside = geo.kind === "spheroid" ? (x * x) / (geo.a_par * geo.a_par) + r2 <= 1 + 1e-9 : r2 <= 1 + 1e-9;
        if (inside || (npar === 1 && nper === 1)) pts.push(x, y, z);
      }
      if (pts.length === 0) pts.push(0, 0, 0);
      if (pts.length / 3 <= maxPts) return { xyz: Float64Array.from(pts), n: pts.length / 3, spacing: sp };
      sp *= 1.12;
    }
    fail("could not fill the particle with points");
  }

  // ---- fluorescence kernels (widefield and spinning-disk confocal) ----------------
  // scalar Debye PSF |h(r,z)|^2 with h = int_0^a sqrt(cos t) J0(k r sin t) e^{i k z cos t} sin t dt
  function besselJ0(x) {   // Abramowitz and Stegun 9.4.1 / 9.4.3 (|error| < 5e-8)
    const ax = Math.abs(x);
    if (ax <= 3) { const y = (x / 3) * (x / 3); return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 + y * (0.0444479 + y * (-0.0039444 + y * 0.00021))))); }
    const y = 3 / ax;
    const f0 = 0.79788456 + y * (-0.00000077 + y * (-0.0055274 + y * (-0.00009512 + y * (0.00137237 + y * (-0.00072805 + y * 0.00014476)))));
    const t0 = ax - 0.78539816 + y * (-0.04166397 + y * (-0.00003954 + y * (0.00262573 + y * (-0.00054125 + y * (-0.00029333 + y * 0.00013558)))));
    return f0 * Math.cos(t0) / Math.sqrt(ax);
  }
  function besselJ1(x) {   // Abramowitz and Stegun 9.4.4 / 9.4.6
    const ax = Math.abs(x);
    if (ax <= 3) { const y = (x / 3) * (x / 3); return x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109)))))); }
    const y = 3 / ax;
    const f1 = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105 + y * (-0.00249511 + y * (0.00113653 - y * 0.00020033)))));
    const t1 = ax - 2.35619449 + y * (0.12499612 + y * (0.0000565 + y * (-0.00637879 + y * (0.00074348 + y * (0.00079824 - y * 0.00029166)))));
    return (x < 0 ? -1 : 1) * f1 * Math.cos(t1) / Math.sqrt(ax);
  }
  /* Focal intensity of an aplanatic objective (Richards and Wolf), azimuthally averaged:
   * |I0|^2 + 2 |I1|^2 + |I2|^2 with I0 = int (1 + cos t) J0, I1 = int sin t J1, I2 = int (1 - cos t) J2, each
   * weighted by sqrt(cos t) sin t and the defocus and aberration phases (halved so that small apertures give
   * the scalar result). Used for emission (dyes turn freely; in-plane dipoles dominate what the objective
   * collects) and for excitation (circular or unpolarised light). scalar = true gives the older scalar form. */
  function psfStack(na, n_med, l0, r, z, ab, scalar) {
    const a = Math.asin(Math.min(0.999, na / n_med)), k = TWO_PI * n_med / l0, k0 = TWO_PI / l0, NT = 96;
    const A = aberrationFor(ab, n_med, n_med * Math.sin(a), k0);
    const nr = r.length, nz = z.length, out = new Float64Array(nr * nz);
    const st = new Float64Array(NT), ct = new Float64Array(NT), w0 = new Float64Array(NT), w1 = new Float64Array(NT), w2 = new Float64Array(NT), pa = new Float64Array(NT);
    for (let j = 0; j < NT; j++) {
      const t = a * (j + 0.5) / NT; st[j] = Math.sin(t); ct[j] = Math.cos(t);
      const w = Math.sqrt(ct[j]) * st[j] * a / NT;
      if (scalar) { w0[j] = w; w1[j] = 0; w2[j] = 0; }
      else { w0[j] = w * (1 + ct[j]) / 2; w1[j] = w * st[j] / 2; w2[j] = w * (1 - ct[j]) / 2; }
      pa[j] = aberrationPhase(A, n_med * st[j], k0);
    }
    const J0 = new Float64Array(nr * NT), J1 = new Float64Array(nr * NT), J2 = new Float64Array(nr * NT);
    for (let i = 0; i < nr; i++) for (let j = 0; j < NT; j++) {
      const x = k * r[i] * st[j], j0 = besselJ0(x), j1 = besselJ1(x);
      J0[i * NT + j] = j0; J1[i * NT + j] = j1; J2[i * NT + j] = x > 1e-8 ? 2 * j1 / x - j0 : 0;
    }
    const c = new Float64Array(NT), s = new Float64Array(NT);
    for (let iz = 0; iz < nz; iz++) {
      for (let j = 0; j < NT; j++) { const ph = k * z[iz] * ct[j] + pa[j]; c[j] = Math.cos(ph); s[j] = Math.sin(ph); }
      for (let i = 0; i < nr; i++) {
        let r0 = 0, i0 = 0, r1 = 0, i1 = 0, r2 = 0, i2 = 0;
        for (let j = 0; j < NT; j++) {
          const o = i * NT + j, f0 = w0[j] * J0[o], f1 = w1[j] * J1[o], f2 = w2[j] * J2[o];
          r0 += f0 * c[j]; i0 += f0 * s[j]; r1 += f1 * c[j]; i1 += f1 * s[j]; r2 += f2 * c[j]; i2 += f2 * s[j];
        }
        out[i * nz + iz] = r0 * r0 + i0 * i0 + 2 * (r1 * r1 + i1 * i1) + r2 * r2 + i2 * i2;
      }
    }
    return out;
  }
  // Hankel transform F(q) = 2 pi int f(r) J0(q r) r dr on uniform r grid
  function hankel(f, r, q, J0tab) {
    const nr = r.length, nq = q.length, dr = r[1] - r[0], out = new Float64Array(nq);
    for (let iq = 0; iq < nq; iq++) { let s = 0; for (let i = 0; i < nr; i++) s += f[i] * J0tab[iq * nr + i] * r[i]; out[iq] = TWO_PI * s * dr; }
    return out;
  }
  function fluorescenceKernel(cfg) {
    // cfg: na_obj, liquid, l_ex, l_em, diameter_um, q_per_um, z_um (any sorted grid), confocal (bool),
    //      pinhole_um_sample (diameter at sample), crosstalk (spinning disk: pinhole fill factor, 0 for a single pinhole)
    // Spinning-disk crosstalk is approximated as the confocal response plus the fill factor times the widefield
    // response (out-of-focus light reaching neighbouring pinholes).
    const q = cfg.q_per_um, z = cfg.z_um, nq = q.length, nz = z.length;
    const n_med = liquidIndex(cfg.liquid, cfg.l_em);
    const na = Math.min(cfg.na_obj, n_med * 0.999);
    const rmax = Math.max(8, 4 * Math.PI / (q[1] - q[0]) / 8), NR = 400;
    const r = new Float64Array(NR); for (let i = 0; i < NR; i++) r[i] = (i + 0.5) * rmax / NR;
    const J0tab = new Float64Array(nq * NR); for (let iq = 0; iq < nq; iq++) for (let i = 0; i < NR; i++) J0tab[iq * NR + i] = besselJ0(q[iq] * r[i]);
    const zs = new Float64Array(nz);
    const R = cfg.diameter_um / 2;
    const NS = R > 0.05 ? 7 : 1;           // slices through the dyed sphere
    const K = new Float64Array(nq * nz), Kwf = new Float64Array(nq * nz);
    const eta = cfg.confocal ? (cfg.crosstalk || 0) : 0;
    need(eta >= 0 && eta < 0.5, "crosstalk fill factor out of range");
    // all axial positions needed (particle centre z plus slice offsets)
    const offs = [], wts = [], rads = [];
    for (let j = 0; j < NS; j++) {
      const zz = NS === 1 ? 0 : -R + R * (2 * j + 1) / NS, rr = Math.sqrt(Math.max(0, R * R - zz * zz));
      offs.push(zz); rads.push(rr); wts.push(NS === 1 ? 1 : rr * rr);
    }
    const W = wts.reduce(function (s, v) { return s + v; }, 0);
    for (let j = 0; j < NS; j++) {
      for (let iz = 0; iz < nz; iz++) zs[iz] = z[iz] + offs[j];
      const em = psfStack(na, n_med, cfg.l_em, r, zs, cfg.aberration, cfg.scalar);
      const ex = cfg.confocal ? psfStack(na, liquidIndex(cfg.liquid, cfg.l_ex), cfg.l_ex, r, zs, cfg.aberration, cfg.scalar) : null;
      for (let iz = 0; iz < nz; iz++) {
        let f = new Float64Array(NR);
        for (let i = 0; i < NR; i++) f[i] = em[i * nz + iz];
        if (eta > 0) {
          const Fw = hankel(f, r, q, J0tab), rw = rads[j];
          for (let iq = 0; iq < nq; iq++) { const u = q[iq] * rw, form = u < 1e-9 ? 1 : 2 * besselJ1(u) / u; Kwf[iq * nz + iz] += (wts[j] / W) * Fw[iq] * form; }
        }
        if (cfg.confocal) {
          // (emission PSF convolved with pinhole disk) via Hankel: multiply by 2 J1(q a)/(q a) * area, back-transform
          const a = cfg.pinhole_um_sample / 2;
          const F = hankel(f, r, q, J0tab);
          const G = new Float64Array(nq);
          for (let iq = 0; iq < nq; iq++) { const u = q[iq] * a; G[iq] = F[iq] * (u < 1e-9 ? 1 : 2 * besselJ1(u) / u); }
          // inverse Hankel on r grid: f(r) = (1/2pi) int F(q) J0(q r) q dq
          const dq = q[1] - q[0], g = new Float64Array(NR);
          for (let i = 0; i < NR; i++) { let s = 0; for (let iq = 0; iq < nq; iq++) s += G[iq] * J0tab[iq * NR + i] * q[iq]; g[i] = s * dq / TWO_PI; }
          for (let i = 0; i < NR; i++) f[i] = g[i] * ex[i * nz + iz];
        }
        const Fq = hankel(f, r, q, J0tab);
        const rr = rads[j];
        for (let iq = 0; iq < nq; iq++) {
          const u = q[iq] * rr, form = u < 1e-9 ? 1 : 2 * besselJ1(u) / u;
          K[iq * nz + iz] += (wts[j] / W) * Fq[iq] * form;
        }
      }
    }
    // normalise: in-focus particle integrates to 1 (photon count set by the camera model)
    let izf = 0; for (let iz = 0; iz < nz; iz++) if (Math.abs(z[iz]) < Math.abs(z[izf])) izf = iz;
    const norm = K[izf];
    need(norm > 0, "fluorescence kernel normalisation failed");
    if (eta > 0) {
      const nw = Kwf[izf]; need(nw > 0, "widefield normalisation failed");
      for (let i = 0; i < K.length; i++) K[i] = (K[i] / norm + eta * Kwf[i] / nw) / (1 + eta);
    } else for (let i = 0; i < K.length; i++) K[i] /= norm;
    return { K: K };
  }

  // ---- low-rank split K(q, z) = sum_m U_m(q) V_m(z) -------------------------------
  // eigenvectors u_m of K K^T (nq x nq, symmetric Jacobi); U_m = u_m, V_m(z) = sum_q u_m(q) K(q, z)
  function lowRank(K, nq, nz, tol, mmax) {
    const n = nq, C = new Float64Array(n * n);
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) { let s = 0; const oa = a * nz, ob = b * nz; for (let j = 0; j < nz; j++) s += K[oa + j] * K[ob + j]; C[a * n + b] = s; C[b * n + a] = s; }
    const V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
    let tr = 0; for (let i = 0; i < n; i++) tr += C[i * n + i];
    for (let sweep = 0; sweep < 40; sweep++) {
      let off = 0; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) off += C[a * n + b] * C[a * n + b];
      if (off <= 1e-22 * tr * tr) break;
      for (let p = 0; p < n; p++) for (let r = p + 1; r < n; r++) {
        const apr = C[p * n + r]; if (Math.abs(apr) <= 1e-300) continue;
        const th = (C[r * n + r] - C[p * n + p]) / (2 * apr), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k2 = 0; k2 < n; k2++) { const x = C[k2 * n + p], y = C[k2 * n + r]; C[k2 * n + p] = c * x - s * y; C[k2 * n + r] = s * x + c * y; }
        for (let k2 = 0; k2 < n; k2++) { const x = C[p * n + k2], y = C[r * n + k2]; C[p * n + k2] = c * x - s * y; C[r * n + k2] = s * x + c * y; }
        for (let k2 = 0; k2 < n; k2++) { const x = V[k2 * n + p], y = V[k2 * n + r]; V[k2 * n + p] = c * x - s * y; V[k2 * n + r] = s * x + c * y; }
      }
    }
    const ev = []; for (let i = 0; i < n; i++) ev.push({ i: i, v: C[i * n + i] });
    ev.sort(function (a, b) { return b.v - a.v; });
    const total = ev.reduce(function (s, e) { return s + Math.max(0, e.v); }, 0);
    need(total > 0, "kernel is zero");
    let kept = 0, M = 0;
    while (M < Math.min(mmax, n)) { kept += Math.max(0, ev[M].v); M++; if (1 - kept / total < tol) break; }
    const U = [], Vz = [];
    for (let m = 0; m < M; m++) {
      const col = ev[m].i, u = new Float64Array(nq), v = new Float64Array(nz);
      for (let i = 0; i < nq; i++) u[i] = V[i * n + col];
      for (let i = 0; i < nq; i++) { const ui = u[i], o = i * nz; if (ui !== 0) for (let j = 0; j < nz; j++) v[j] += ui * K[o + j]; }
      U.push(u); Vz.push(v);
    }
    return { U: U, V: Vz, rank: M, residual: Math.max(0, 1 - kept / total) };
  }

  // ---- FFT helpers (radix 2), sign = -1 forward, +1 inverse (no scaling) -----------
  const FFT = {
    tables: function (n) {
      need(n >= 2 && (n & (n - 1)) === 0, "FFT size must be a power of two: " + n);
      let bits = 0; while ((1 << bits) < n) bits++;
      const rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
      const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) { c[i] = Math.cos(TWO_PI * i / n); s[i] = Math.sin(TWO_PI * i / n); }
      return { n: n, rev: rev, c: c, s: s };
    },
    work: function (n) { return { r: new Float64Array(n), i: new Float64Array(n) }; },
    fft1: function (re, im, tb, sign) {
      const n = tb.n, rev = tb.rev;
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let st = 0; st < n; st += size) for (let k = 0; k < half; k++) {
          const c = tb.c[k * step], s = sign * tb.s[k * step], a = st + k, b = a + half;
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    },
    // in-place FFT of every row of an n x n array (no copies)
    rows: function (re, im, n, tb, sign, only) {
      const rev = tb.rev, C = tb.c, Sn = tb.s;
      for (let o = 0; o < n * n; o += n) {
        if (only && !only[o / n]) continue;
        for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const a = o + i, b = o + j; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
        for (let size = 2; size <= n; size <<= 1) {
          const half = size >> 1, step = n / size;
          for (let k = 0; k < half; k++) {
            const c = C[k * step], s = sign * Sn[k * step];
            for (let st = o + k; st < o + n; st += size) {
              const b = st + half, tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
              re[b] = re[st] - tr; im[b] = im[st] - ti; re[st] += tr; im[st] += ti;
            }
          }
        }
      }
    },
    transpose: function (re, im, n) {
      for (let y = 0; y < n; y++) for (let x = y + 1; x < n; x++) {
        const a = y * n + x, b = x * n + y; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t;
      }
    },
    // 2D FFT, result in transposed layout [kx][ky] (one transpose saved)
    // optional 'only': second pass only for the listed rows of the transposed array (frequencies needed later)
    fft2T: function (re, im, n, tb, sign, only) { FFT.rows(re, im, n, tb, sign); FFT.transpose(re, im, n); FFT.rows(re, im, n, tb, sign, only); },
    fft2: function (re, im, n, tb, w, sign) { FFT.rows(re, im, n, tb, sign); FFT.transpose(re, im, n); FFT.rows(re, im, n, tb, sign); FFT.transpose(re, im, n); }
  };

  const api = {
    MATERIALS: MATERIALS, SOURCES: SOURCES, nWater: nWater, nWaterGlycerol: nWaterGlycerol,
    viscosityWaterGlycerol_mPa_s: viscosityWaterGlycerol_mPa_s, mie: mie,
    brightFieldKernel: brightFieldKernel, transmittedKernel: transmittedKernel, depthGrid: depthGrid, sampleSpectrum: sampleSpectrum, fluorescenceKernel: fluorescenceKernel, lowRank: lowRank,
    sourcePoints: sourcePoints, liquidIndex: liquidIndex, particleIndex: particleIndex, particleDensity: particleDensity, liquidDensity: liquidDensity, FFT: FFT,
    besselJ0: besselJ0, besselJ1: besselJ1, psfStack: psfStack, aberrationFit: aberrationFit, aberrationPhase: aberrationPhase, vectorWeights: vectorWeights, vectorWeightsInto: vectorWeightsInto,
    shapeGeometry: shapeGeometry, depolarization: depolarization, polarizability: polarizability, formFactor: formFactor,
    hydrodynamics: hydrodynamics, polCoeffs: polCoeffs, brightnessTable: brightnessTable, bodyPoints: bodyPoints
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.OPTICS = api;
})(this);
