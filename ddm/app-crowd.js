(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const MU = "\u00b5", DEG = "\u00b0", SUP3 = "\u00b3";

  // ---- the instrument: Nikon ECLIPSE Ti2-E with a choice of cameras and confocal units ----------------
  const OBJECTIVES = JSON.parse(document.getElementById("objectives-data").textContent);
  // Ti2 condenser lenses (Nikon Ti2 series specifications): maximum NA and working distance
  const CONDENSERS = {
    elwd: { label: "ELWD, NA 0.3, WD 75 mm", na: 0.3 },
    lwd: { label: "LWD, NA 0.52, WD 30 mm", na: 0.52 },
    namc: { label: "NAMC, NA 0.4, WD 44 mm", na: 0.4 },
    clwd: { label: "CLWD, NA 0.72, WD 13 mm", na: 0.72 },
    hna_dry: { label: "HNA dry, NA 0.85, WD 5 mm", na: 0.85 },
    hna_oil: { label: "HNA oil, NA 1.4, WD 2 mm", na: 1.4 }
  };
  // Cameras. Numbers from: Hamamatsu technical note SCAS0134E (ORCA-Flash4.0 V3); Teledyne Photometrics
  // Kinetix datasheet Rev B2; Andor CB2 specifications (High Res, 24.5 MP). Marked "assumed" where the
  // datasheets give no value.
  const CAMERAS = {
    orca: {
      label: "Hamamatsu ORCA-Flash4.0 V3", px: 6.5, cols: 2048, rows: 2048, qe: 0.82, bins: [1, 2, 4], bin_charge: false, timing: "rolling_center",
      rois: [2048, 1024, 512, 256, 128, 64],
      modes: { standard: { label: "Standard scan (read noise 1.6 e-)", rn: 1.6, fw: 30000, t_row: 1 / (100 * 1024) }, slow: { label: "Slow scan (read noise 1.4 e-)", rn: 1.4, fw: 30000, t_row: 1 / (30 * 1024) } },
      ifaces: { cameralink: "Camera Link", usb16: "USB 3.0, 16 bit", usb12: "USB 3.0, 12 bit", usb8: "USB 3.0, 8 bit" },
      // centre-out read-out, two rows at a time; USB limited by bandwidth (40 / 53 / 80 frames/s full frame)
      fps: function (roi, outpx, mode, iface) {
        let f = 1 / ((roi / 2) * this.modes[mode].t_row);
        const usb = { usb16: 40, usb12: 53, usb8: 80 }[iface];
        if (usb) f = Math.min(f, usb * 2048 * 2048 / (outpx * outpx));
        return f;
      },
      rowTime: function (mode) { return this.modes[mode].t_row; }, minExposure: function () { return 0; }
    },
    kinetix: {
      label: "Teledyne Photometrics Kinetix", px: 6.5, cols: 3200, rows: 3200, qe: 0.95, bins: [1, 2, 4], bin_charge: false, timing: "rolling",
      rois: [3200, 2048, 1024, 512, 256, 128, 64],
      modes: {
        dynamic: { label: "Dynamic range, 16 bit (read noise 1.6 e-, full well 15000 e-)", rn: 1.6, fw: 15000, t_row: 3.749e-6, usb: 39 },
        sensitivity: { label: "Sensitivity, 12 bit (1.2 e-, 1000 e-)", rn: 1.2, fw: 1000, t_row: 3.53125e-6, usb: 52 },
        speed: { label: "Speed, 8 bit (2.0 e-, 200 e-)", rn: 2.0, fw: 200, t_row: 0.625e-6, usb: 79 },
        subelectron: { label: "Sub-electron, 16 bit (0.7 e-, 1000 e-)", rn: 0.7, fw: 1000, t_row: 60.1e-6, usb: 5.2 }
      },
      ifaces: { pcie: "PCIe", usb: "USB 3.2" },
      // rolling shutter from the top, one row after the other (plus about 5 us per frame, from the line-scan table)
      fps: function (roi, outpx, mode, iface) {
        let f = 1 / (roi * this.modes[mode].t_row + 5e-6);
        if (iface === "usb") f = Math.min(f, this.modes[mode].usb * 3200 * 3200 / (outpx * outpx));
        return f;
      },
      rowTime: function (mode) { return this.modes[mode].t_row; }, minExposure: function () { return 0; }
    },
    cb2: {
      label: "Andor CB2 High Res (24.5 MP)", px: 2.74, cols: 5328, rows: 4608, qe: 0.74, bins: [1, 2], bin_charge: true, timing: "global",
      rois: [4608, 2048, 1024, 512, 256, 128, 64],
      modes: {
        hdr16: { label: "16 bit HDR (read noise 1.4 e-, full well 9500 e-)", rn: 1.4, fw: 9500, full: { cxp: 37, gige: 24 }, bin: { cxp: null, gige: null }, tmin: { cxp: 5274e-6, gige: 6783e-6 } },
        b12: { label: "12 bit, 24 dB gain (1.4 e-, about 600 e-)", rn: 1.4, fw: 600, full: { cxp: 74, gige: 32 }, bin: { cxp: 283, gige: 129 }, tmin: { cxp: 5274e-6, gige: 8911e-6 } },
        b10: { label: "10 bit, 24 dB gain (1.4 e-, about 600 e-)", rn: 1.4, fw: 600, full: { cxp: 102, gige: 32 }, bin: { cxp: 361, gige: 125 }, tmin: { cxp: 4496e-6, gige: 8911e-6 } },
        b8: { label: "8 bit, 24 dB gain (1.4 e-, about 600 e-)", rn: 1.4, fw: 600, full: { cxp: 106, gige: 48 }, bin: { cxp: 386, gige: 188 }, tmin: { cxp: 4412e-6, gige: 6769e-6 } }
      },
      ifaces: { cxp: "CoaXPress", gige: "10 GigE" },
      // global shutter; time per frame = t0 + rows x t_row, with t0 from the 16-line point (2560 frames/s at 8 bit)
      timeModel: function (mode, iface, b) {
        const t8 = (1 / this.modes.b8.full[iface] - 1 / 2560) / (4608 - 16), t0 = 1 / 2560 - 16 * t8;
        const m = this.modes[mode], ff = b === 2 ? m.bin[iface] : m.full[iface], rows = b === 2 ? 2304 : 4608;
        if (!ff) return null;
        return { t0: t0, t_row: (1 / ff - t0) / rows };
      },
      fps: function (roi, outpx, mode, iface, b) { const tm = this.timeModel(mode, iface, b); return tm ? 1 / (tm.t0 + (roi / b) * tm.t_row) : 0; },
      rowTime: function () { return 0; },
      // minimum integration time is given for full frames; assumed to shrink with the read-out time for smaller regions
      minExposure: function (roi, mode, iface, b) { const tm = this.timeModel(mode, iface, b); if (!tm) return 0; return this.modes[mode].tmin[iface] * (tm.t0 + (roi / b) * tm.t_row) / (tm.t0 + (4608 / b) * tm.t_row); }
    }
  };
  // Nikon AX R (resonant) and AX (galvano) point scanners, from Nikon's AX specifications:
  // resonant 30 frames/s at 2048 x 512 and 720 frames/s at 2048 x 16 (line 65.1 us, 0.35 ms per frame);
  // galvano up to 10 frames/s at 512 x 512. Scan field: square inside the 25 mm field number (assumed).
  const SCANNERS = {
    resonant: { label: "Resonant (AX R)", line: function () { return 1 / (30 * 512); }, overhead: (1 / 720 - 16 / (30 * 512)), fill: 0.7 },
    galvano: { label: "Galvano (AX)", line: function (px) { return 1 / (10 * 512) * px / 512; }, overhead: 0, fill: 0.8 }
  };
  const GAASP_QE = 0.4;            // assumed (not given by Nikon)
  const GAASP_ENF = 1.25;          // noise variance factor of the dynode chain, d / (d - 1) for a first-dynode gain d of about 5 (assumed)
  // Phase-contrast annuli (condenser) and the matching rings in the objectives, in NA units. Nikon does not
  // publish these sizes: estimates, the same for annulus and ring. Ring: 25 % intensity transmission and a
  // -90 degree phase shift, which makes higher-index particles dark (dark contrast, as Nikon's DL objectives).
  const ANNULI = { PhL: [0.04, 0.06], Ph1: [0.10, 0.13], Ph2: [0.24, 0.29], Ph3: [0.42, 0.50] };
  const RING_PHASE = -Math.PI / 2;
  // Dark-field condensers: NA ranges of Nikon's dry and oil dark-field condensers (listed for the upright stands)
  const DFCOND = { dry: { label: "Dark-field condenser, dry (NA 0.80-0.95)", na: [0.80, 0.95] }, oil: { label: "Dark-field condenser, oil (NA 1.20-1.43)", na: [1.20, 1.43] } };
  function objRing() { const p = objective().ph; if (!p) return null; const k = p.replace(/^Ext\s*/i, "").replace(/^PH/i, "Ph"); return ANNULI[k] ? k : null; }
  const XLIGHT = { pinhole_um: 50, spacing_um: 250, rpm: 15000, min_exposure_s: 1e-3 };   // CrestOptics X-Light V3, standard disk
  const XLIGHT_FILL = Math.PI / 4 * Math.pow(XLIGHT.pinhole_um / XLIGHT.spacing_um, 2);   // pinhole fill factor (square layout assumed): crosstalk
  const DYES = {
    green: { label: "Green (excite 488 nm, emit 520 nm)", ex: 0.488, em: 0.52 },
    red: { label: "Red (excite 561 nm, emit 600 nm)", ex: 0.561, em: 0.60 },
    far: { label: "Far red (excite 640 nm, emit 680 nm)", ex: 0.64, em: 0.68 }
  };
  const MATERIALS = { ps: "Polystyrene", pmma: "PMMA", silica: "Silica", rm257: "Polymerised liquid crystal (RM257)", mfa: "Hyflon MFA (fluoropolymer)", bacterium: "Bacteria (index 1.39)", custom: "Other (set the index)" };
  // materials that make sense for each shape; the first is the default when the shape is chosen
  const SHAPE_MATERIALS = { sphere: ["ps", "pmma", "silica", "custom"], bisphere: ["rm257", "mfa", "custom"], prolate: ["ps", "pmma", "silica", "custom"], oblate: ["ps", "pmma", "silica", "custom"], rod: ["bacterium", "silica", "ps", "custom"] };
  const LIQUIDS = { water: "Water", glycerol: "Water + glycerol", custom: "Other (set index and viscosity)" };
  const FIELD_NUMBER_MM = 25;          // Ti2 field of view (F-mount port); also the X-Light V3 and AX scan fields

  function objIndexByName(name) { for (let i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].n === name) return i; throw new Error("objective not found: " + name); }

  // How the particles interact (movie.js, interact): hard spheres, or hard spheres with a screened (Yukawa) repulsion, as
  // for charged colloids in water with little salt: U/kT = U0 sigma exp(-kappa (r - sigma)) / r.
  const INTER = { hard: "Hard spheres: they only touch", yukawa: "Charged spheres: they repel before they touch" };
  const KB = 1.380649e-23;
  // Stokes-Einstein diffusion coefficient of one particle alone (um^2/s) and the Brownian time sigma^2 / D0
  function dSE() { return KB * (state.T_C + 273.15) / (3 * Math.PI * viscosity_mPa_s() * 1e-3 * state.diameter_um * 1e-6) * 1e12; }
  function tauB() { return state.diameter_um * state.diameter_um / dSE(); }
  // Percus-Yevick structure factor of hard spheres (Wertheim, Thiele), x = q sigma
  function percusYevick(eta, x) {
    const a = Math.pow(1 + 2 * eta, 2) / Math.pow(1 - eta, 4), b = -6 * eta * Math.pow(1 + eta / 2, 2) / Math.pow(1 - eta, 4), g = eta * a / 2;
    if (x < 1e-2) return Math.pow(1 - eta, 4) / Math.pow(1 + 2 * eta, 2);
    const s = Math.sin(x), c = Math.cos(x);
    return 1 / (1 + 24 * eta / Math.pow(x, 6) * (a * x * x * x * (s - x * c) + b * x * x * (2 * x * s - (x * x - 2) * c - 2) + g * ((4 * x * x * x - 24 * x) * s - (x * x * x * x - 12 * x * x + 24) * c + 24)));
  }
  function interactSpec() { return { kind: state.inter, U0: state.U0, kappa_sigma: state.kappa_sigma, label_fraction: state.label }; }
  function interHint() {
    const ph = state.phi_c, gap = state.diameter_um * (Math.pow(0.74 / ph, 1 / 3) - 1);
    let h = "Volume fraction " + fmtSig(ph, 2) + ": " + (ph < 0.1 ? "dilute enough that the particles rarely meet." : ph < 0.3 ? "each particle often bumps into its neighbours." : "crowded: each particle sits in a cage of neighbours, about " + fmtSig(Math.max(0, gap) * 1000, 2) + " nm apart at the surfaces on average.");
    if (state.inter === "yukawa") {
      h += " The repulsion reaches about " + fmtSig(state.diameter_um / state.kappa_sigma * 1000, 2) + " nm (the Debye length) beyond contact, with " + fmtSig(state.U0, 2) + " kT at contact.";
      // effective hard-sphere diameter: where the repulsion falls to 1 kT; beyond about 0.49 of effective volume fraction
      // hard spheres freeze
      let r = 1; if (state.U0 > 1) { let lo = 1, hi = 1 + 30 / state.kappa_sigma; for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (state.U0 * Math.exp(-state.kappa_sigma * (m - 1)) / m > 1) lo = m; else hi = m; } r = lo; }
      if (ph * r * r * r > 0.49) h += " This crowded and this charged, a real sample would freeze into a crystal; the simulation is too short to show it, and its peak of S(q) becomes very sharp.";
    }
    return h;
  }
  function labelHint() {
    return state.label >= 0.99 ? "All particles show: the patterns follow how the crowd as a whole rearranges (collective diffusion)." : state.label <= 0.1 ? "Only a few particles show, far apart: the patterns follow single particles among invisible neighbours (self diffusion)." : "Dyed and undyed particles mixed: a bit of both.";
  }
  // the standard sample: 1 um PMMA spheres, all dyed, at volume fraction 0.3 in water and glycerol (half by mass), spinning-disk
  // confocal through a 60x water-immersion objective, 512 log-spaced frames
  const BASE = {
    mode: "spinning", particle: "pmma", n_custom: 1.59, diameter_um: 1, size_spread: 0, size_dist: "schulz", phi: 1e-3,
    liquid: "glycerol", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 8, focus_frac: 0.5, optics: "auto",
    phi_c: 0.3, inter: "hard", U0: 30, kappa_sigma: 10, label: 1,
    objective: objIndexByName("CFI Plan Apochromat VC 60XC WI"), condenser: "elwd", na_c: 0.3, source: "green",
    dye: "green", rate_ph_ms: 1000, bg_e_ms: 2, light_frac: 0.5,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 1, roi: 256, sim_px: 128, n_frames: 512,
    annulus: "Ph2", ring_T: 0.25, df_kind: "dry", df_light_e: 1e4, stray_frac: 1e-4, dic_shear_um: 0.24, dic_bias_deg: 90, dic_angle_deg: 45,
    scanner: "resonant", scan_px: 512, zoom: 1, line_avg: 2, pinhole_au: 1, scan_rate: 2e7,
    frame_rate_hz: 100, exposure_ms: 2, frame_timing: "log", log_factor: 5,
    shape: "sphere", aspect: 3, dn: 0.1, dn_body: 0, polarizer: "off", analyzer: "off", pol_angle_deg: 90, extinction: 1e-4,
    windowing: "off", q_min: null, q_max: null, seed: 1, rho_custom: 1.05, rho_liquid: 1.0,
    x_noise: "on", x_offset: "on", x_refrate: "on", x_refsmooth: "on"
  };
  let state = Object.assign({}, BASE);
  const LEVEL_RANK = { curious: 1, student: 2, researcher: 3, addict: 4 };
  let level = "curious";

  function fmtSize(um) { return um < 1 ? Math.round(um * 1000) + " nm" : um.toFixed(um < 2 ? 2 : 1) + " " + MU + "m"; }
  function fmtNum(v) { return v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function fmtSig(v, d) { if (!Number.isFinite(v)) return "-"; if (v === 0) return "0"; return String(Number(v.toPrecision(d))); }
  function fmtTime(s) { return s < 1 ? fmtSig(s * 1000, 2) + " ms" : fmtSig(s, 2) + " s"; }
  function fmtPhi(v) { const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); return (Math.round(m * 10) / 10) + "e" + e; }

  // ---- derived acquisition numbers ------------------------------------------------
  function objective() { return OBJECTIVES[state.objective]; }
  function cam() { return CAMERAS[state.camera]; }
  const SCANNING = function () { return state.mode === "scanning"; };
  function scanFieldUm() { return FIELD_NUMBER_MM * 1000 / Math.SQRT2 / objective().m / state.zoom; }
  function pixelUm() { return SCANNING() ? scanFieldUm() / state.scan_px : cam().px * state.binning / objective().m; }
  function outPx() { return SCANNING() ? state.scan_px : state.roi / state.binning; }      // image pixels per side
  // simulated part of the image: as asked, but halved while the particles (or, for rods and ellipsoids, the
  // points filling them) would exceed what the browser handles. Nothing is stored, so undoing the setting
  // that enlarged the field brings the full size back.
  // particles that push each other are followed in small time steps (movie.js, interact): the cost is particles x steps
  const MAX_PARTICLES = 4000, MAX_POINTS = 60000, MAX_WORK = 3e7;
  let phiCapped = false, phiRaised = false;
  function particlesFor(n) { return state.phi_c / geometry().volume * Math.pow(n * pixelUm(), 2) * state.cell_um; }
  // time step of the simulation (free steps of 3 % of the diameter) and particle-steps for a field of n pixels
  // time step, settling time and neighbours as in movie.js (setupInteract), for the cost of a run
  function stepS() {
    const sg = state.diameter_um, D0 = dSE(); let h = Math.pow(0.03 * sg, 2) / (2 * D0);
    if (state.inter === "yukawa" && state.U0 > 0) {
      const kap = state.kappa_sigma / sg, Ur = function (r) { return state.U0 * sg * Math.exp(-kap * (r - sg)) / r; };
      let rs = sg; if (state.U0 > 10) { let lo = sg, hi = sg + 20 / kap; for (let it = 0; it < 60; it++) { const m = 0.5 * (lo + hi); if (Ur(m) > 10) lo = m; else hi = m; } rs = 0.5 * (lo + hi); }
      h = Math.min(h, 0.03 * sg / (D0 * Ur(rs) * (kap + 1 / rs)));
    }
    return h;
  }
  function settleTauB(n) { const ph = state.phi_c, S0 = Math.pow(1 - ph, 4) / Math.pow(1 + 2 * ph, 2), kmin = 2 * Math.PI / Math.max(n * pixelUm(), state.cell_um); return Math.max(1, 2 * S0 / Math.pow(kmin * state.diameter_um, 2)); }
  function neighbourFactor(n) { if (state.inter !== "yukawa") return 1; const sg = state.diameter_um, rc = Math.max(sg, Math.min(sg + 6 * sg / state.kappa_sigma, Math.min(n * pixelUm(), state.cell_um) / 2)); return 1 + 0.2 * (Math.pow(rc / sg, 3) - 1); }
  function workFor(n) { const T = Math.min(state.n_frames, maxFrames(n)), dt = 1 / state.frame_rate_hz, span = BURSTS() ? MOVIE.logTimes(T, dt, state.log_factor)[T - 1] + dt : T * dt; return particlesFor(n) * (span + settleTauB(n) * tauB()) / stepS() * neighbourFactor(n); }
  function simSeconds() { return workFor(simPx()) / 5e5 + 5; }
  const MAX_SECONDS = 180;
  function pointsPerParticle() {
    if (!BODY()) return 1;
    const lam = 0.85 * centralWavelength(), na = Math.min(objective().na, 1.34);   // shortest wavelengths set the spacing
    let q = 2 * Math.PI / lam * 2 * na;
    if (TRANS() && state.mode !== "darkfield") q = 2 * Math.PI / lam * (na + Math.min(illumination().na_out, 1.34));
    return OPTICS.bodyPoints(geometry(), 0.7 * Math.PI / q, 64).n;
  }
  function simPx() {
    let n = Math.min(state.sim_px, outPx());
    const ppp = pointsPerParticle();
    while (n > 32 && (particlesFor(n) > MAX_PARTICLES || particlesFor(n) * ppp > MAX_POINTS || workFor(n) > MAX_WORK)) n /= 2;
    return n;
  }
  function lineTime() { const sc = SCANNERS[state.scanner]; return sc.line(state.scan_px) * state.line_avg; }
  function maxFps() {
    if (SCANNING()) return 1 / (state.scan_px * lineTime() + SCANNERS[state.scanner].overhead);
    return cam().fps(state.roi, outPx(), state.cam_mode, state.iface, state.binning);
  }
  function minExposureMs() {
    if (SCANNING()) return 0;
    let t = cam().minExposure(state.roi, state.cam_mode, state.iface, state.binning);
    if (state.mode === "spinning") t = Math.max(t, XLIGHT.min_exposure_s);
    return 1000 * t;
  }
  function maxFrames(n) { return Math.floor((1 << 23) / (n * n)); }
  // frame timing: log-spaced frames in a repeating cycle, the movie log_factor times longer (movie.js logTimes)
  function BURSTS() { return state.frame_timing === "log" && state.log_factor > 1; }
  function movieSpanS(stretch) {
    const T = Math.min(state.n_frames, maxFrames(simPx())), dt = 1 / state.frame_rate_hz, k = stretch === undefined ? (BURSTS() ? state.log_factor : 1) : stretch;
    return k > 1 ? MOVIE.logTimes(T, dt, k)[T - 1] + dt : T * dt;
  }
  function fmtDur(s) { return s < 120 ? fmtTime(s) : s < 7200 ? fmtSig(s / 60, 2) + " min" : fmtSig(s / 3600, 2) + " h"; }
  function liquidSpec() {
    if (state.liquid === "water") return { glycerol_w: 0 };
    if (state.liquid === "glycerol") return { glycerol_w: state.glycerol_w };
    return { n: state.n_liquid, viscosity_mPa_s: state.visc_mPa_s, density_g_cm3: state.rho_liquid };
  }
  function viscosity_mPa_s() { const l = liquidSpec(); return l.viscosity_mPa_s !== undefined ? l.viscosity_mPa_s : OPTICS.viscosityWaterGlycerol_mPa_s(l.glycerol_w, state.T_C); }
  function nLiquid(l0) { return OPTICS.liquidIndex(liquidSpec(), l0); }
  function nParticle(l0) { return state.particle === "custom" ? state.n_custom : OPTICS.particleIndex(state.particle, l0); }
  function centralWavelength() { if (!TRANS()) return DYES[state.dye].em; const sp = OPTICS.SOURCES[state.source].sample(); return sp.reduce(function (s, p) { return s + p.w * p.l; }, 0); }
  function geometry() { return OPTICS.shapeGeometry(state.shape, state.diameter_um, BODY() ? Math.max(state.shape === "rod" ? 2 : 1, state.aspect) : 1); }
  function particleCount() { return Math.round(particlesFor(simPx())); }
  function polarization() {
    const P = state.polarizer === "on", A = state.analyzer === "on";
    if (!TRANS() || state.mode === "dic" || (!P && !A)) return null;
    // with unpolarized light the analyzer's direction does not matter; with a polarizer it sits at the chosen angle from it
    return { polarizer_deg: P ? 0 : null, analyzer_deg: A ? (P ? state.pol_angle_deg : 0) : null, extinction: state.extinction };
  }
  function detectorConfig() {
    if (SCANNING()) {
      const sc = SCANNERS[state.scanner], tl = sc.line(state.scan_px);
      return { kind: "scanner", pixel_um: pixelUm(), qe: GAASP_QE, dwell_s: tl * sc.fill / state.scan_px, passes: state.line_avg, t_row_s: tl * state.line_avg, rows_total: state.scan_px, crop_row0: (state.scan_px - simPx()) / 2, excess_noise: GAASP_ENF, resonant_fill: state.scanner === "resonant" ? sc.fill : undefined };
    }
    const c = cam(), m = c.modes[state.cam_mode];
    return { kind: "camera", pixel_um: c.px, binning: state.binning, bin_charge: c.bin_charge, qe: c.qe, read_noise_e: m.rn, full_well_e: m.fw,
      timing: c.timing, t_row_s: c.rowTime(state.cam_mode), rows_total: state.roi, crop_row0: (state.roi - simPx() * state.binning) / 2 };
  }
  // illumination aperture in the liquid (NA units) and pupil mask for the transmitted-light modes
  function illumination() {
    const an = ANNULI[state.annulus], cn = CONDENSERS[state.condenser].na;   // the condenser lens clips a too-wide annulus
    const ann = { na_in: Math.min(an[0], 0.9 * cn), na_out: Math.min(an[1], cn) };
    if (state.mode === "phase") return ann;
    if (state.mode === "darkfield") {
      if (state.df_kind === "annulus") return ann;
      const r = DFCOND[state.df_kind].na; return { na_in: r[0], na_out: r[1] };
    }
    return { na_in: 0, na_out: Math.max(0.005, Math.min(state.na_c, CONDENSERS[state.condenser].na)) };
  }
  function pupilSpec() {
    if (state.mode === "phase") { const r = objRing(); return r ? { kind: "phase", ring_in: ANNULI[r][0], ring_out: ANNULI[r][1], amp: Math.sqrt(state.ring_T), phase: RING_PHASE } : { kind: "none" }; }
    if (state.mode === "dic") return { kind: "dic", shear_um: state.dic_shear_um, angle: state.dic_angle_deg * Math.PI / 180, bias: state.dic_bias_deg * Math.PI / 180 };
    return { kind: "none" };
  }
  // vector optics: automatic above this aperture (objective, or condenser in transmitted light), where 1 - cos(theta) at the
  // pupil edge exceeds about 0.25 in water and the scalar weights start to be off by more than a few percent
  const VECTOR_NA = 0.9;
  function useVector() {
    if (state.optics !== "auto") return state.optics === "vector";
    const nl = nLiquid(centralWavelength()), naO = Math.min(objective().na, nl);
    const naC = TRANS() ? Math.min(illumination().na_out, nl) : 0;
    return Math.max(naO, naC) >= VECTOR_NA;
  }
  // immersion index; multi-immersion objectives are taken as set for the liquid (no aberration)
  const IMMERSION = { dry: 1.0, oil: 1.518, water: 1.333, silicone: 1.406 };
  function immersionIndex(ob, lam) { return ob.im === "multi" ? nLiquid(lam) : IMMERSION[ob.im]; }
  function simConfig() {
    const ob = objective(), dye = DYES[state.dye];
    const lam = centralWavelength(), m = nParticle(lam) / nLiquid(lam), x = Math.PI * nLiquid(lam) * state.diameter_um / lam;
    return Object.assign({
      seed: state.seed, mode: TRANS() ? "brightfield" : state.mode, objective: { mag: ob.m, na: ob.na, n_imm: immersionIndex(ob, lam) },
      illum: illumination(), pupil: pupilSpec(), source: state.source,
      df_light_e: state.df_light_e, stray_frac: state.stray_frac,
      homodyne: state.mode === "darkfield" || 2 * x * Math.abs(m - 1) > 0.3,   // keep |E_s|^2 when the phase shift through the particle is not small (always in dark field; the engine adds it for anisotropic particles and polarisers)
      l_ex_um: dye.ex, l_em_um: dye.em, pinhole_um: XLIGHT.pinhole_um, crosstalk: XLIGHT_FILL, pinhole_au: state.pinhole_au,
      photons_per_particle: Math.max(0.01, state.rate_ph_ms * state.exposure_ms), background_photons: SCANNING() ? 0.01 : state.bg_e_ms * state.exposure_ms * state.binning * state.binning,
      scan_rate_hz: state.scan_rate, light_frac: state.light_frac,
      detector: detectorConfig(), n_px: simPx(), n_frames: Math.min(state.n_frames, maxFrames(simPx())),
      frame_rate_hz: state.frame_rate_hz, exposure_s: SCANNING() ? 0 : state.exposure_ms / 1000, log_timing: BURSTS() ? { factor: state.log_factor } : null,
      particle: state.particle === "custom" ? { n: state.n_custom, rho: state.rho_custom } : state.particle, diameter_um: state.diameter_um, size_distribution: state.size_dist, size_spread: state.size_spread,
      shape: state.shape, aspect: BODY() ? Math.max(state.shape === "rod" ? 2 : 1, state.aspect) : 1, birefringence: state.shape === "sphere" || !TRANS() ? 0 : state.shape === "bisphere" ? state.dn : state.dn_body, polarization: polarization(),
      volume_fraction: state.phi, liquid: liquidSpec(), T_C: state.T_C, cell_um: state.cell_um, focus_um: state.focus_frac * state.cell_um,
      vector: useVector()
    }, { interact: interactSpec(), volume_fraction: state.phi_c, drift_um_s: 0, drift_deg: 0, gravity: false, walls: false });
  }
  function analysisOptions() {
    return { q_min_per_um: state.q_min, q_max_per_um: state.q_max, windowing: state.windowing === "on", noise: state.x_noise === "off" ? "fit" : undefined, offset: state.x_offset !== "off", ref_rate: state.x_refrate !== "off", ref_smooth: state.x_refsmooth !== "off", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const BODY = function () { return state.shape === "prolate" || state.shape === "oblate" || state.shape === "rod"; };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "particle", group: "Sample", lvl: 2, label: "Material of the particles", kind: "select", options: function () { return SHAPE_MATERIALS.sphere.map(function (k) { return [k, MATERIALS[k]]; }); } },
    { key: "n_custom", group: "Sample", lvl: 1, label: "Particle refractive index", kind: "lin", min: 1.3, max: 2.6, step: 0.01, fmt: function (v) { return v.toFixed(2); }, when: function () { return state.particle === "custom"; } },
    { key: "diameter_um", group: "Sample", lvl: 1, label: "Diameter of the particles", kind: "log", entry: { unit: MU + "m", scale: 1, step: 0.01, digits: 3 }, min: 0.6, max: 3, fmt: fmtSize, hint: function () { return level === "curious" ? "Larger particles move more slowly, and arrange themselves on a larger scale." : "Alone they would diffuse with D0 = " + fmtSig(dSE(), 3) + " " + MU + "m\u00b2/s, crossing their own diameter in about " + fmtTime(tauB()) + " (the Brownian time, \u03c3\u00b2/D0)."; } },
    { key: "phi_c", group: "Sample", lvl: 1, label: "How crowded: volume fraction", kind: "lin", entry: { unit: "%", scale: 100, step: 1, digits: 0 }, min: 0.01, max: 0.45, step: 0.01, fmt: function (v) { return Math.round(100 * v) + " %"; }, hint: function () { return interHint() + " " + particleCount() + " particles in the simulated volume." + (phiCapped ? " Lowered to fit what the browser can follow." : ""); } },
    { key: "inter", group: "Sample", lvl: 1, label: "How they interact", kind: "select", options: Object.keys(INTER).map(function (k) { return [k, INTER[k]]; }) },
    { key: "U0", group: "Sample", lvl: 2, label: "Repulsion at contact", kind: "log", min: 3, max: 300, fmt: function (v) { return fmtSig(v, 2) + " kT"; }, when: function () { return state.inter === "yukawa"; } },
    { key: "kappa_sigma", group: "Sample", lvl: 2, label: "Range of the repulsion: diameter / Debye length", kind: "log", min: 2, max: 30, fmt: function (v) { return fmtSig(v, 2); }, when: function () { return state.inter === "yukawa"; }, hint: function () { return "Smaller numbers: less salt, a longer reach."; } },
    { key: "label", group: "Sample", lvl: 1, label: "Share of the particles that are dyed", when: function () { return !TRANS(); }, kind: "select", options: [[1, "All"], [0.5, "Half"], [0.2, "One in five"], [0.05, "One in twenty"]], hint: labelHint },
    { key: "liquid", group: "Sample", lvl: 2, label: "Liquid", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", group: "Sample", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; }, hint: function () { return "Viscosity " + fmtSig(viscosity_mPa_s(), 2) + " mPa s at " + Math.round(state.T_C) + " " + DEG + "C."; } },
    { key: "n_liquid", group: "Sample", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", group: "Sample", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", group: "Sample", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, entry: { unit: DEG + "C", scale: 1, step: 1, digits: 0 }, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", group: "Sample", lvl: 2, label: "Chamber thickness", kind: "log", min: 3, max: 30, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return "The simulated box repeats sideways and in depth, so there are no walls."; } },
    { key: "focus_frac", group: "Sample", lvl: 2, label: "Focus height in the chamber", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },

    { key: "mode", group: "Microscope (Nikon Ti2-E)", lvl: 1, label: "Imaging mode", kind: "select", options: [["brightfield", "Bright field"], ["phase", "Phase contrast"], ["darkfield", "Dark field"], ["dic", "DIC (Nomarski)"], ["fluorescence", "Widefield fluorescence"], ["spinning", "Spinning-disk confocal (CrestOptics X-Light V3)"], ["scanning", "Point-scanning confocal (Nikon AX R)"]], hint: modeHint },
    { key: "objective", group: "Microscope (Nikon Ti2-E)", lvl: 1, label: "Objective", kind: "objective", hint: objectiveHint },
    { key: "optics", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "Optics model", kind: "select", options: [["auto", "Automatic: vector from NA " + VECTOR_NA + " on"], ["scalar", "Scalar (faster)"], ["vector", "Vector (polarization through the objective)"]], hint: function () { return (useVector() ? "Vector optics in use. " : "Scalar optics in use. ") + "Vector optics changes spot sizes and high-q amplitudes by 5-25 % at NA above about 0.9, much less below; the rates hardly change. It makes the calculation slower (most for dark field, DIC and crossed polarizers). Aberration from focusing into the liquid is included either way."; } },
    { key: "condenser", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Condenser lens", kind: "select", options: Object.keys(CONDENSERS).map(function (k) { return [k, CONDENSERS[k].label]; }), when: function () { return BF() || state.mode === "phase" || (state.mode === "darkfield" && state.df_kind === "annulus"); } },
    { key: "na_c", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Aperture diaphragm (condenser NA)", kind: "lin", min: 0.01, max: 1.4, step: 0.01, fmt: function (v) { return Math.min(v, CONDENSERS[state.condenser].na).toFixed(2); }, when: BF, hint: function () { const nc = Math.min(state.na_c, CONDENSERS[state.condenser].na); return nc > objective().na ? "Wider than the objective: part of the light misses it (towards dark field)." : "Smaller values: more coherent light, more contrast, larger depth of field."; } },
    { key: "df_kind", group: "Microscope (Nikon Ti2-E)", lvl: 1, label: "Dark field with", kind: "select", options: [["annulus", "A phase annulus outside the objective (poor man's)"], ["dry", DFCOND.dry.label + " (rich man's)"], ["oil", DFCOND.oil.label + " (rich man's)"]], when: function () { return state.mode === "darkfield"; }, hint: dfHint },
    { key: "annulus", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Phase annulus in the condenser", kind: "select", options: Object.keys(ANNULI).map(function (k) { return [k, k + " (NA " + ANNULI[k][0] + "-" + ANNULI[k][1] + ", estimated)"]; }), when: function () { return state.mode === "phase" || (state.mode === "darkfield" && state.df_kind === "annulus"); }, hint: annulusHint },
    { key: "ring_T", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "Phase ring transmission", kind: "lin", min: 0.05, max: 1, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.mode === "phase"; } },
    { key: "dic_bias_deg", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "DIC bias retardation", kind: "lin", min: 0, max: 180, step: 5, fmt: function (v) { return Math.round(v) + DEG; }, when: function () { return state.mode === "dic"; }, hint: "90" + DEG + " gives the most linear response to phase; small values give dark backgrounds and strong relief." },
    { key: "dic_shear_um", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "DIC shear", kind: "lin", min: 0.05, max: 1, step: 0.01, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, when: function () { return state.mode === "dic"; }, hint: "0.24 " + MU + "m was measured for a Nikon N2 prism (Ostler et al.)." },
    { key: "dic_angle_deg", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "DIC shear direction", kind: "select", num: true, options: [[0, "0" + DEG], [45, "45" + DEG], [90, "90" + DEG]], when: function () { return state.mode === "dic"; } },
    { key: "source", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Light source", kind: "select", options: Object.keys(OPTICS.SOURCES).map(function (k) { return [k, OPTICS.SOURCES[k].label]; }), when: TRANS },
    { key: "df_light_e", group: "Microscope (Nikon Ti2-E)", lvl: 1, label: "Lamp power (electrons per pixel if all the light reached the camera)", kind: "log", min: 1e4, max: 1e10, fmt: function (v) { return fmtPhi(v); }, when: function () { return state.mode === "darkfield" || (TRANS() && state.mode !== "dic" && state.analyzer === "on"); }, hint: function () { return state.mode === "darkfield" ? "" : "With an analyzer the lamp is turned up to fill the camera, up to this limit."; } },
    { key: "stray_frac", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "Stray light (share of the illumination)", kind: "log", min: 1e-6, max: 1e-2, fmt: function (v) { return fmtPhi(v); }, when: function () { return state.mode === "darkfield"; }, hint: "Light scattered by dust, cover-glass defects and the optics; it sets the dark-field background." },
    { key: "dye", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Dye", kind: "select", options: Object.keys(DYES).map(function (k) { return [k, DYES[k].label]; }), when: FL },
    { key: "rate_ph_ms", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Brightness: photons per particle per ms reaching the camera", kind: "log", min: 1, max: 20000, fmt: function (v) { return fmtSig(v, 2); }, when: function () { return state.mode === "fluorescence" || state.mode === "spinning"; }, hint: "Photons reaching the camera; the camera's quantum efficiency is applied on top." },
    { key: "bg_e_ms", group: "Microscope (Nikon Ti2-E)", lvl: 3, label: "Background light (photons per pixel per ms)", kind: "log", min: 0.01, max: 100, fmt: function (v) { return fmtSig(v, 2); }, when: function () { return state.mode === "fluorescence" || state.mode === "spinning"; } },

    { key: "scanner", group: "Scanner (Nikon AX R)", lvl: 1, label: "Scanner", kind: "select", options: Object.keys(SCANNERS).map(function (k) { return [k, SCANNERS[k].label]; }), when: SCANNING },
    { key: "scan_px", group: "Scanner (Nikon AX R)", lvl: 2, label: "Image size", kind: "select", num: true, options: [[256, "256 x 256"], [512, "512 x 512"], [1024, "1024 x 1024"], [2048, "2048 x 2048"]], when: SCANNING },
    { key: "zoom", group: "Scanner (Nikon AX R)", lvl: 2, label: "Scan zoom", kind: "select", num: true, options: [[1, "1x"], [2, "2x"], [4, "4x"], [8, "8x"], [16, "16x"], [32, "32x"]], when: SCANNING, hint: function () { return "Pixel " + fmtSig(pixelUm(), 2) + " " + MU + "m; about " + fmtSig(DYES[state.dye].em / (4 * Math.min(objective().na, 1.33)), 2) + " " + MU + "m samples the confocal spot well."; } },
    { key: "line_avg", group: "Scanner (Nikon AX R)", lvl: 2, label: "Line averaging", kind: "select", num: true, options: [[1, "none"], [2, "2"], [4, "4"], [8, "8"], [16, "16"]], when: SCANNING },
    { key: "pinhole_au", group: "Scanner (Nikon AX R)", lvl: 3, label: "Pinhole", kind: "lin", min: 0.3, max: 3, step: 0.1, fmt: function (v) { return v.toFixed(1) + " Airy units"; }, when: SCANNING },
    { key: "scan_rate", group: "Scanner (Nikon AX R)", lvl: 2, label: "Laser: photons per second from a particle at the focus", kind: "log", min: 1e5, max: 1e9, fmt: function (v) { return fmtPhi(v); }, when: SCANNING, hint: "GaAsP detectors, quantum efficiency assumed 40 %." },

    { key: "camera", group: "Camera and recording", lvl: 1, label: "Camera", kind: "select", options: Object.keys(CAMERAS).map(function (k) { return [k, CAMERAS[k].label]; }), when: function () { return !SCANNING(); } },
    { key: "cam_mode", group: "Camera and recording", lvl: 2, label: "Camera mode", kind: "select", options: function () { const c = cam(); return Object.keys(c.modes).map(function (k) { return [k, c.modes[k].label]; }); }, when: function () { return !SCANNING(); } },
    { key: "iface", group: "Camera and recording", lvl: 3, label: "Interface", kind: "select", options: function () { const c = cam(); return Object.keys(c.ifaces).map(function (k) { return [k, c.ifaces[k]]; }); }, when: function () { return !SCANNING(); } },
    { key: "roi", group: "Camera and recording", lvl: 2, label: "Region of interest on the sensor", kind: "select", num: true, options: function () { const c = cam(); return c.rois.map(function (r) { return [r, r + " x " + r + (r === c.rows ? " (full height)" : "")]; }); }, when: function () { return !SCANNING(); } },
    { key: "binning", group: "Camera and recording", lvl: 2, label: "Binning", kind: "select", num: true, options: function () { return allowedBins().map(function (b) { return [b, b + " x " + b + (cam().bin_charge && b > 1 ? " (on chip)" : "")]; }); }, when: function () { return !SCANNING(); }, hint: binHint },
    { key: "frame_rate_hz", group: "Camera and recording", lvl: 1, label: "Frame rate", kind: "log", min: 0.5, max: 30000, fmt: function (v) { return fmtNum(v) + " frames/s"; }, hint: function () { return "Up to " + fmtNum(maxFps()) + " frames/s with these settings."; } },
    { key: "exposure_ms", group: "Camera and recording", lvl: 2, label: "Exposure time", kind: "log", min: 0.01, max: 2000, fmt: function (v) { return fmtSig(v, 2) + " ms"; }, when: function () { return !SCANNING(); }, hint: function () { const t = minExposureMs(); return t > 0 ? "At least " + fmtSig(t, 2) + " ms here" + (state.mode === "spinning" ? " (the disk sweeps the field about 1000 times a second, and each exposure must last at least one sweep)" : "") + "." : ""; } },
    { key: "light_frac", group: "Camera and recording", lvl: 2, label: "Lamp brightness (background as a share of the full well)", kind: "log", min: 0.002, max: 0.9, fmt: function (v) { return fmtSig(100 * v, 2) + " %"; }, when: function () { return TRANS() && state.mode !== "darkfield"; }, hint: function () { const fw = detFullWell(); return "Background " + Math.round(state.light_frac * fw) + " electrons per pixel; shot noise " + fmtSig(100 / Math.sqrt(state.light_frac * fw), 2) + " %."; } },
    { key: "n_frames", group: "Camera and recording", lvl: 2, label: "Number of frames", kind: "select", num: true, options: [[128, "128"], [256, "256"], [512, "512"], [1024, "1024"], [2048, "2048"]],
      hint: function () { return "The browser holds up to " + maxFrames(simPx()) + " frames at " + simPx() + " x " + simPx() + " pixels; asking for more makes the simulated image smaller."; } },
    { key: "frame_timing", group: "Camera and recording", lvl: 2, label: "Frame timing", kind: "select", options: [["even", "Evenly spaced"], ["log", "Log-spaced, in a repeating cycle (like a multi-tau correlator)"]],
      hint: function () { return BURSTS() ? "The same frames cover " + fmtDur(movieSpanS()) + " instead of " + fmtDur(Math.min(state.n_frames, maxFrames(simPx())) / state.frame_rate_hz) + ". In each cycle the first frames follow at the frame rate, then the gaps grow by a fixed factor; the cycle repeats. Slow and fast motion then fit in one movie." : "All frames one frame interval apart: " + fmtDur(Math.min(state.n_frames, maxFrames(simPx())) / state.frame_rate_hz) + " of movie."; } },
    { key: "log_factor", group: "Camera and recording", lvl: 2, label: "Log-spaced: how much longer the movie lasts", kind: "select", num: true, when: function () { return state.frame_timing === "log"; },
      options: function () { return [2, 5, 10, 20, 50].map(function (k) { return [k, k + " times (" + fmtDur(movieSpanS(k)) + ")"]; }); } },
    { key: "sim_px", group: "Camera and recording", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]],
      hint: function () { return "The particles push each other at every step of " + fmtTime(stepS()) + ": about " + fmtSig(Math.max(1, simSeconds()), 1) + " s to simulate" + (simPx() < Math.min(state.sim_px, outPx()) ? ", after halving the simulated part to " + simPx() + " x " + simPx() + " pixels to keep it short" : "") + "."; } },

    { key: "windowing", group: "Analysis", lvl: 2, label: "Windowing (Giavazzi et al. 2017)", kind: "select", options: [["off", "Off"], ["on", "On: each frame multiplied by a window that falls to zero at the edges"]],
      hint: function () { return state.windowing === "on" ? "Cells or particles that cross the edge of the image no longer leave bands along the axes of the map in step 4, nor a fast decay that swamps the finest patterns. The price: the window darkens the edges, so less of the field counts and the results scatter more, and patterns wider than a fifth of the field are left out (the window mixes each pattern with its neighbours)." : "The Fourier transform treats the image as one tile of a repeating pattern, so cells or particles crossing the edges make jumps at the tile borders. The central cross of the map is left out to remove most of their effect."; } },
    { key: "qrange", group: "Analysis", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // where each control sits: the imaging mode, then everything about the sample, the light reaching it, and how the
  // "Addict": the additions to the published method, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_noise", lvl: 4, label: "Camera noise known from the detector", kind: "select", options: ONOFF("B at each q from the first delays"),
      hint: function () { return "On: B = 2 (excess-noise factor x mean count + read noise\u00b2), the same at every q. Off: B at each q from a quadratic through the first five delays."; } },
    { key: "x_offset", lvl: 4, label: "Rate from a line that may miss f = 1", kind: "select", options: ONOFF("the line goes through f = 1 at zero delay"),
      hint: function () { return "On: the straight line through ln f over the first delays has its own intercept, so a small error in A, or a fast part before the first delay, does not tilt it. Off: it is forced through ln f = 0 at zero delay."; } },
    { key: "x_refrate", lvl: 4, label: "Rates against the reference", kind: "select", options: ONOFF("D(q) = \u0393 / q\u00b2"),
      hint: function () { return "On: D(q) / D0 = \u0393 / \u0393ref, the rate of each pattern against that of the same pattern in the dilute reference, which holds what motion along the axis of the microscope adds. Off: D(q) = \u0393 / q\u00b2."; } },
    { key: "x_refsmooth", lvl: 4, label: "Reference smoothed over q", kind: "select", options: ONOFF("each q bin of the reference on its own"),
      hint: function () { return "On: the amplitude and the rates of the reference, which change smoothly with q, are smoothed over seven neighbouring q bins. Off: each bin on its own, with its own noise."; } }
  );

  // light is collected and recorded. Every control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Sample", [
      ["The particles", ["phi_c", "inter", "U0", "kappa_sigma", "diameter_um", "particle", "n_custom", "label", "dye"]],
      ["Liquid and temperature", ["liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "T_C"]],
      ["Chamber", ["cell_um"]]]],
    ["Microscope (Nikon Ti2-E)", [
      ["", ["mode"]],
      ["Illumination", ["source", "condenser", "na_c", "df_kind", "annulus", "light_frac", "df_light_e", "stray_frac", "rate_ph_ms", "bg_e_ms", "scan_rate"]],
      ["Objective and contrast", ["objective", "optics", "focus_frac", "ring_T", "dic_bias_deg", "dic_shear_um", "dic_angle_deg"]]]],
    ["Camera and recording", [
      ["", ["camera", "cam_mode", "iface", "roi", "binning"]],
      ["Point scanner (Nikon AX R)", ["scanner", "scan_px", "zoom", "line_avg", "pinhole_au"]],
      ["Timing", ["frame_rate_hz", "exposure_ms", "n_frames", "frame_timing", "log_factor", "sim_px"]]]],
    ["Analysis", [
      ["", ["windowing", "qrange"]],
      ["Addict: what this page adds", ["x_noise", "x_offset", "x_refrate", "x_refsmooth"]]]]
  ];
  // one-line summary under each block title: [setting, text before, text after]
  const SUMMARY = {
    "Sample": [["inter"], ["diameter_um"], ["phi_c", "", " by volume"], ["liquid", "in "]],
    "Microscope (Nikon Ti2-E)": [["mode"], ["objective"], ["na_c", "condenser NA "]],
    "Camera and recording": [["camera"], ["scanner"], ["frame_rate_hz"], ["exposure_ms", "exposure "], ["n_frames", "", " frames"]],
    "Analysis": [["windowing"]]
  };
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (sb) { sb[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; c.sub = sb[0]; out.push(c); delete byKey[k]; }); }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, windowing: 1, x_noise: 1, x_offset: 1, x_refrate: 1, x_refsmooth: 1 };
  function fmtRate(v) { return fmtSig(v, 2) + " s" + "\u207b\u00b9"; }
  // binning factors the camera allows in the chosen mode (the CB2 cannot bin in 16-bit HDR)
  function allowedBins() {
    const c = cam();
    return c.bins.filter(function (b) { return b === 1 || state.camera !== "cb2" || !!c.modes[state.cam_mode].bin[c.ifaces[state.iface] ? state.iface : "cxp"]; });
  }
  function binHint() {
    const parts = [];
    if (allowedBins().length < cam().bins.length) parts.push("This camera mode does not allow binning; choose a 12, 10 or 8 bit mode to bin 2 x 2.");
    const full = Math.min(state.sim_px, outPx());
    if (simPx() < full) parts.push("With this field the whole simulated part would hold too many particles for the browser, so only the central " + simPx() + " x " + simPx() + " pixels are simulated.");
    return parts.join(" ");
  }
  function detFullWell() { const c = cam(), m = c.modes[state.cam_mode]; return c.bin_charge ? m.fw : m.fw * state.binning * state.binning; }
  function annulusHint() {
    const an = ANNULI[state.annulus], r = objRing(), naEff = Math.min(objective().na, nLiquid(centralWavelength()));
    if (an[1] > CONDENSERS[state.condenser].na) return "This annulus is wider than the condenser lens (NA " + CONDENSERS[state.condenser].na + "): choose a condenser with a higher NA.";
    if (state.mode === "darkfield") return an[0] > naEff ? "Annulus outside the objective's NA " + naEff.toFixed(2) + ": dark field." : "The annulus lies inside the objective's NA " + naEff.toFixed(2) + ", so direct light enters it: not dark field. Use a higher annulus or a lower-NA objective.";
    if (!r) return "This objective has no phase ring: you get annular illumination without phase contrast" + (an[0] > naEff ? " (dark field here)." : ".");
    if (r !== state.annulus) return "The objective has a " + r + " ring: annulus and ring do not match, so contrast is poor.";
    return "Matches the objective's " + r + " ring.";
  }
  function dfHint() {
    const naEff = Math.min(objective().na, nLiquid(centralWavelength()));
    if (state.df_kind === "annulus") return "Poor man's dark field: a phase annulus whose light falls outside a low-NA objective.";
    const r = DFCOND[state.df_kind].na, nIn = Math.min(r[0], nLiquid(centralWavelength()));
    let h = "Rich man's dark field: a condenser built to send only steep light. Nikon lists these for the upright stands; on the Ti2 this is an assumption.";
    if (nIn <= naEff) h += " The objective's NA (" + naEff.toFixed(2) + ") must be below the condenser's inner NA (" + nIn.toFixed(2) + "). Here it is not: direct light enters the objective, so this is bright field with very steep light, whose thin layer in focus makes the rates come out too fast.";
    if (state.df_kind === "oil") h += " In water the illumination can be no steeper than NA " + nLiquid(centralWavelength()).toFixed(2) + ".";
    return h;
  }
  function modeHint() {
    return { brightfield: "", fluorescence: "", phase: "Condenser annulus and objective phase ring; the halo around particles is part of the method.", darkfield: "Only light scattered by the particles reaches the camera.", dic: "Two sheared copies of the image interfere: the picture depends on the shear direction.",
      spinning: "X-Light V3 disk: " + XLIGHT.pinhole_um + " " + MU + "m pinholes every " + XLIGHT.spacing_um + " " + MU + "m, " + XLIGHT.rpm + " rpm; relay to the camera taken as 1x (assumed).",
      scanning: "One point at a time: each row is recorded later than the one above it." }[state.mode];
  }
  function objectiveHint() {
    const o = objective(), lam = centralWavelength(), nl = nLiquid(lam);
    const parts = [o.s + ". Pixel " + fmtSig(pixelUm(), 3) + " " + MU + "m at the sample."];
    if (o.na > nl) parts.push("In this liquid only NA " + nl.toFixed(2) + " can be used (light beyond it is totally reflected at the cover glass).");
    const ni = immersionIndex(o, lam), dF = state.focus_frac * state.cell_um;
    if (Math.abs(ni - nl) > 1e-3 && dF > 0) parts.push("Immersion index " + ni.toFixed(3) + ", liquid " + nl.toFixed(3) + ": focusing " + fmtSig(dF, 2) + " " + MU + "m into the chamber adds spherical aberration (included; correction collar taken as set for a standard cover glass).");
    if (o.ph) parts.push("Phase ring " + o.ph + (objRing() ? "." : " (not simulated).") );
    return parts.join(" ");
  }

  const ctlEls = {};
  function buildControls() {
    // blocks (sample, microscope, camera, analysis), each folding to a one-line summary, with sub-blocks inside
    const host = $("ctl-groups"), subs = {};
    CONTROLS.forEach(function (c) {
      if (!blockEls[c.group]) {
        const d = document.createElement("details"); d.className = "cblock"; d.open = !window.matchMedia("(max-width: 63.99rem)").matches;   // folded on phones and narrow windows
        d.dataset.block = c.group.split(" ")[0].toLowerCase();   // its colour
        d.innerHTML = '<summary><h3></h3><span class="bsum"></span></summary><div class="cbody"></div>';
        d.querySelector("h3").textContent = c.group;
        host.appendChild(d); blockEls[c.group] = { el: d, body: d.querySelector(".cbody"), sum: d.querySelector(".bsum"), ctls: [] };
      }
      const sk = c.group + "|" + c.sub;
      if (!subs[sk]) {
        const s = document.createElement("div"); s.className = "csub";
        if (c.sub) { const h = document.createElement("h4"); h.textContent = c.sub; s.appendChild(h); }
        blockEls[c.group].body.appendChild(s); subs[sk] = { el: s, ctls: [] }; subEls.push(subs[sk]);
      }
      subs[sk].ctls.push(c); blockEls[c.group].ctls.push(c);
      const wrap = document.createElement("div");
      wrap.className = "ctl" + (c.lvl === 2 ? " lvl-2" : c.lvl === 3 ? " lvl-3" : c.lvl === 4 ? " lvl-4" : "");
      const id = "c-" + c.key;
      let hintEl = null;
      if (c.kind === "log" || c.kind === "lin") {
        // a number box replaces the read-out where an exact value matters (c.entry: unit, scale from the stored value, step)
        const E = c.entry;
        wrap.innerHTML = '<div class="row"><label for="' + id + '"></label>' + (E ? '<span class="numentry"><input type="number" inputmode="decimal"> ' + E.unit + '</span>' : '<output for="' + id + '"></output>') + '</div><input type="range" id="' + id + '">';
        wrap.querySelector("label").textContent = typeof c.label === "function" ? c.label() : c.label;
        const inp = wrap.querySelector('input[type="range"]'), out = wrap.querySelector("output"), num = wrap.querySelector('input[type="number"]');
        if (c.kind === "log") { inp.min = 0; inp.max = 1000; inp.step = 1; } else { inp.min = c.min; inp.max = c.max; inp.step = c.step; }
        const read = function () { return c.kind === "log" ? c.min * Math.pow(c.max / c.min, inp.value / 1000) : parseFloat(inp.value); };
        const show = function (v) { const t = c.fmt(v); if (out) out.textContent = t; else num.value = +(v * E.scale).toFixed(E.digits); inp.setAttribute("aria-valuetext", t); };
        if (num) {
          num.min = c.min * E.scale; num.max = c.max * E.scale; num.step = E.step;
          num.setAttribute("aria-label", (typeof c.label === "function" ? c.label() : c.label) + " (" + E.unit + ")");
          num.addEventListener("change", function () { const v = parseFloat(num.value) / E.scale; if (!isFinite(v)) { show(state[c.key]); return; } state[c.key] = Math.min(c.max, Math.max(c.min, v)); ctlEls[c.key].set(state[c.key]); onChange(c.key); });
        }
        inp.addEventListener("input", function () { show(read()); });
        inp.addEventListener("change", function () { state[c.key] = read(); onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, set: function (v) { inp.value = c.kind === "log" ? 1000 * Math.log(v / c.min) / Math.log(c.max / c.min) : v; show(v); } };
      } else if (c.kind === "select" || c.kind === "objective") {
        wrap.innerHTML = '<label for="' + id + '"></label><select id="' + id + '"></select>';
        wrap.querySelector("label").textContent = typeof c.label === "function" ? c.label() : c.label;
        const sel = wrap.querySelector("select");
        if (c.kind === "objective") {
          let og = null, last = null;
          objOptions().forEach(function (o) {
            if (o[2] !== last) { og = document.createElement("optgroup"); og.label = o[2]; sel.appendChild(og); last = o[2]; }
            const op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; og.appendChild(op);
          });
        } else if (typeof c.options !== "function") c.options.forEach(function (o) { const op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
        sel.addEventListener("change", function () { state[c.key] = (c.num || c.kind === "objective") ? parseInt(sel.value, 10) : c.key === "label" ? parseFloat(sel.value) : sel.value; onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, sel: sel, sig: "", set: function (v) { sel.value = String(v); } };
      } else if (c.kind === "qrange") {
        wrap.innerHTML = '<label></label><div class="qrange"><input type="number" id="c-qmin" step="0.1" min="0" placeholder="from: auto" aria-label="Lowest q"><input type="number" id="c-qmax" step="0.1" min="0" placeholder="to: auto" aria-label="Highest q"></div><div class="hint">Leave empty to use the whole measurable range.</div>';
        wrap.querySelector("label").textContent = typeof c.label === "function" ? c.label() : c.label;
        const a = wrap.querySelector("#c-qmin"), b = wrap.querySelector("#c-qmax");
        const upd = function () { state.q_min = a.value === "" ? null : parseFloat(a.value); state.q_max = b.value === "" ? null : parseFloat(b.value); onChange("q_min"); };
        a.addEventListener("change", upd); b.addEventListener("change", upd);
        ctlEls.qrange = { wrap: wrap, set: function () { a.value = state.q_min === null ? "" : state.q_min; b.value = state.q_max === null ? "" : state.q_max; } };
      }
      if (c.hint) { hintEl = document.createElement("div"); hintEl.className = "hint"; wrap.appendChild(hintEl); }
      ctlEls[c.kind === "qrange" ? "qrange" : c.key].hint = hintEl;
      subs[sk].el.appendChild(wrap);
    });
  }
  const blockEls = {}, subEls = [];
  function ctlShown(c) { return c.lvl <= LEVEL_RANK[level] && (!c.when || c.when()); }
  // the value of a setting as shown, shortened for the summary line (option text up to a colon or a bracket)
  function ctlText(k) {
    const c = CONTROLS.find(function (x) { return x.key === k; }), e = ctlEls[k];
    if (!c || !e || (c.when && !c.when())) return "";
    if (e.sel) {
      const o = e.sel.options[e.sel.selectedIndex]; if (!o) return "";
      const t = o.textContent, head = t.split(/:| \(/)[0].trim();
      return head === "Example" ? t.slice(t.indexOf(":") + 1).split(" (")[0].trim() : head;   // "Example: E. coli-like rods ..."
    }
    return c.fmt ? c.fmt(state[k]) : "";
  }
  function syncBlocks() {
    subEls.forEach(function (s) { s.el.hidden = !s.ctls.some(ctlShown); });
    Object.keys(blockEls).forEach(function (b) {
      const B = blockEls[b]; B.el.hidden = !B.ctls.some(ctlShown);
      const parts = (SUMMARY[b] || []).map(function (s) {
        if (s[0] === "windowing") return state.windowing === "on" ? "windowing" : "";
        let t = ctlText(s[0]); if (!t) return "";
        if (s[1] && /^[A-Z][a-z]/.test(t)) t = t.charAt(0).toLowerCase() + t.slice(1);   // "in water", not "in Water" (DIC stays DIC)
        return (s[1] || "") + t + (s[2] || "");
      }).filter(Boolean);
      B.sum.textContent = parts.join(", ");
    });
  }
  function syncControls() {
    if (typeof syncPredictions === "function") syncPredictions();
    CONTROLS.forEach(function (c) {
      const e = ctlEls[c.kind === "qrange" ? "qrange" : c.key];
      if (typeof c.options === "function") {
        const opts = c.options(), sig = JSON.stringify(opts);
        if (sig !== e.sig) { e.sel.innerHTML = ""; opts.forEach(function (o) { const op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; e.sel.appendChild(op); }); e.sig = sig; }
      }
      if (c.kind === "qrange") e.set(); else e.set(state[c.key]);
      if (typeof c.label === "function") e.wrap.querySelector("label").textContent = c.label();
      if (c.when) e.wrap.hidden = !c.when();
      if (e.hint) e.hint.textContent = typeof c.hint === "function" ? c.hint() : c.hint;
    });
    syncBlocks();
  }
  // keep settings physically possible: frame rate within the camera limit, exposure within a frame
  function constrain() {
    if (!SCANNING()) {
      const c = cam();
      if (!c.modes[state.cam_mode]) state.cam_mode = Object.keys(c.modes)[0];
      if (!c.ifaces[state.iface]) state.iface = Object.keys(c.ifaces)[0];
      if (c.rois.indexOf(state.roi) < 0) state.roi = c.rois.filter(function (r) { return r <= 512; })[0] || c.rois[c.rois.length - 1];
      if (allowedBins().indexOf(state.binning) < 0) state.binning = 1;   // e.g. the CB2 cannot bin in 16-bit HDR
    }
    let f = maxFps();
    const tmin = minExposureMs();
    if (tmin > 0) f = Math.min(f, 1000 / tmin);
    if (state.frame_rate_hz > f) state.frame_rate_hz = f;
    if (!SCANNING()) {
      if (state.exposure_ms > 1000 / state.frame_rate_hz) state.exposure_ms = 1000 / state.frame_rate_hz;
      if (state.exposure_ms < tmin) state.exposure_ms = tmin;
    }
    if (state.sim_px > outPx()) state.sim_px = Math.max(32, outPx());
    if (state.mode === "dic") { if (state.shape !== "sphere") state.shape = "sphere"; if (state.cell_um > 200) state.cell_um = 200; }   // limits of the DIC model
    if (state.shape === "rod" && state.aspect < 2) state.aspect = 2;
    if (SHAPE_MATERIALS[state.shape].indexOf(state.particle) < 0) state.particle = SHAPE_MATERIALS[state.shape][0];
    // memory limit (pixels x frames): the setting the reader changed last wins
    if (state.n_frames > maxFrames(simPx())) {
      if (lastKey === "n_frames") { while (state.sim_px > 32 && state.n_frames > maxFrames(simPx())) state.sim_px /= 2; }
      if (state.n_frames > maxFrames(simPx())) state.n_frames = [2048, 1024, 512, 256, 128].filter(function (n) { return n <= maxFrames(simPx()); })[0] || 128;
    }
    // particle limit: the simulated field is halved down to 32 pixels (simPx); beyond that the concentration is lowered
    const n32 = particlesFor(32), ppp = pointsPerParticle(), over = Math.max(n32 / MAX_PARTICLES, n32 * ppp / MAX_POINTS);
    phiCapped = over > 1;
    if (phiCapped) state.phi_c *= 0.95 / over;
    if (TRANS() && state.label !== 1) state.label = 1;
    if (state.cell_um < 2 * state.diameter_um) state.cell_um = Math.min(30, 2 * state.diameter_um);      // a box at least two particles deep     // in transmitted light every particle scatters, dyed or not
  }
  // zoom that samples the confocal spot at about Nyquist (pixel near lambda / 4 NA)
  function autoZoom() {
    const target = DYES[state.dye].em / (4 * Math.min(objective().na, 1.33));
    const opts = [1, 2, 4, 8, 16, 32];
    state.zoom = opts.filter(function (z) { return FIELD_NUMBER_MM * 1000 / Math.SQRT2 / objective().m / z / state.scan_px <= target * 1.5; })[0] || 32;
  }
  let lastKey = null;
  let prevMode = BASE.mode;
  function onChange(key) {
    lastKey = key; compare = null;
    // switching to phase contrast with an objective that has no phase ring: take the phase objective of the same
    // magnification with the closest NA (Plan Fluor 20X -> Plan Fluor DLL 20X Ph1), so phase contrast is really on
    if (key === "mode" && state.mode === "phase" && !objRing()) {
      const o0 = objective(); let best = -1, bd = Infinity;
      OBJECTIVES.forEach(function (o, i) { if (!o.ph || o.m !== o0.m) return; const k = o.ph.replace(/^Ext\s*/i, "").replace(/^PH/i, "Ph"); if (!ANNULI[k]) return; const dd = Math.abs(o.na - o0.na) + (o.n.split(" ")[1] === o0.n.split(" ")[1] ? 0 : 0.05); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) state.objective = best;
    }
    if ((key === "mode" || key === "objective") && state.mode === "phase" && objRing()) state.annulus = objRing();
    if (SCANNING() && (key === "mode" || key === "objective" || key === "scan_px")) autoZoom();
    // back from the point scanner to a camera: the scanner's slow frame rate is not kept
    if (key === "mode" && prevMode === "scanning" && !SCANNING()) state.frame_rate_hz = BASE.frame_rate_hz;
    if (key === "mode") prevMode = state.mode;
    if (key === "camera") { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; state.binning = 1; }
    resetPredictions();
    constrain(); syncControls(); drawFov();
    if (ANALYSIS_KEYS[key]) scheduleAnalysis(); else schedule();
  }

  // ---- reader level -----------------------------------------------------------------
  function setLevel(lv, fromUser) {
    if (!LEVEL_RANK[lv]) lv = "curious";
    level = lv;
    document.documentElement.setAttribute("data-level", lv);
    $("lv-" + lv).checked = true;
    // Curious starts from the sample: the other blocks fold to their one-line summary (all open on wide screens otherwise)
    const wide = !window.matchMedia("(max-width: 63.99rem)").matches;
    Object.keys(blockEls).forEach(function (b) { blockEls[b].el.open = wide && (lv !== "curious" || b === "Sample"); });
    const lvOpen = lv === "addict" ? "researcher" : lv;
    document.querySelectorAll("details.math[data-open-at]").forEach(function (d) { d.open = (lvOpen === d.getAttribute("data-open-at")); });
    // controls hidden at this level go back to the standard value, so the bench shows what is simulated
    let changed = false, changedAna = false;   // a setting of the movie, or only of the analysis
    CONTROLS.forEach(function (c) {
      if (c.lvl <= LEVEL_RANK[lv]) return;
      if (c.kind === "qrange") { if (state.q_min !== null || state.q_max !== null) { state.q_min = null; state.q_max = null; changedAna = true; } return; }
      if (state[c.key] !== BASE[c.key]) { state[c.key] = BASE[c.key]; if (ANALYSIS_KEYS[c.key]) changedAna = true; else changed = true; }
    });
    if (LEVEL_RANK[lv] < 3 && state.seed !== BASE.seed) { state.seed = BASE.seed; changed = true; }
    if (fromUser && location.hash !== "#" + lv) { try { history.replaceState(null, "", "#" + lv); } catch (e) { /* sandboxed previews (about:srcdoc) refuse it */ } }
    constrain(); syncControls(); drawFov();
    // the "published method only" row is computed at the "Addict" level only
    if (changed) schedule(); else if (changedAna || (cache.res && lv === "addict" && !cache.res.published)) scheduleAnalysis(); else if (cache.res) renderAll();
  }

  // ---- running (in a background worker when the browser allows it) --------------------
  const cache = { movie: null, res: null, cfg: null, opts: null };
  let timer = null, worker = null, runToken = 0, workerOK = true;
  function workerSource() {
    return ["optics-src", "movie-src", "engine-src", "crowd-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
  }
  function makeWorker() {
    try { return new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }))); }
    catch (e) { workerOK = false; return null; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { start("simulate"); }, 150); }
  function scheduleAnalysis() { clearTimeout(timer); timer = setTimeout(function () { start(cache.movie ? "analyse" : "simulate"); }, 150); }
  // the progress bar is pinned to the bottom of the window; "busy" while a run is going
  function progress(frac, stage) { $("bar").style.width = (100 * frac).toFixed(1) + "%"; $("status").textContent = stage + "..."; $("runbar").classList.add("busy"); }
  function idle() { $("runbar").classList.remove("busy"); }
  // a run that stops: say so where the visitor looks (the error, the hero) and grey out the steps, which still show the last run
  function showError(msg) { const el = $("error"); el.hidden = false; el.textContent = "The run stopped: " + msg; $("status").textContent = "The run stopped: see the message under the settings."; $("bar").style.width = "0"; idle();
    $("hero-result").innerHTML = '<span class="chip bad">The run stopped</span><span>' + msg.replace(/[<>&]/g, "") + '</span>';
    document.querySelector(".steps").classList.add("stale"); }
  let inflight = null;
  let runStart = 0;
  function start(kind) {
    runStart = performance.now();
    // a setup that would keep the browser busy for minutes is not started
    if (kind === "simulate" && simSeconds() > MAX_SECONDS) { ++runToken; inflight = null; showError("this setup would take about " + Math.round(simSeconds() / 60) + " minutes to simulate in the browser: shorten the movie (frame rate, number of frames, log-spaced stretch), use smaller particles or a lower viscosity, or a lower volume fraction."); return; }
    if (kind === "analyse" && inflight === "simulate") kind = "simulate";   // the worker's movie would not match the page's
    const token = ++runToken, busy = inflight !== null;
    inflight = kind;
    $("error").hidden = true;
    const cfg = simConfig(), opts = analysisOptions();
    // a busy worker is stopped; an idle one is kept, with the optical kernels it has already computed (movie.js memo)
    if (kind === "simulate" && worker && busy) { worker.terminate(); worker = null; }
    if (workerOK && !worker) worker = makeWorker();
    if (worker) {
      worker.onmessage = function (ev) {
        const m = ev.data; if (m.token !== runToken) return;
        if (m.type === "progress") progress(m.frac, m.stage);
        else if (m.type === "error") { inflight = null; showError(m.message); }
        else if (m.type === "done") { inflight = null; finish(m.movie || cache.movie, m.res, m.movie ? cfg : cache.cfg, opts); }
      };
      worker.onerror = function (e) { if (token !== runToken) return; e.preventDefault(); workerOK = false; worker = null; start(kind === "analyse" && !cache.movie ? "simulate" : kind); };
      worker.postMessage({ type: kind, token: token, cfg: cfg, opts: opts });
    } else runHere(kind, token, cfg, opts);
  }
  // fallback without a worker: time-sliced on the page
  function drive(gen, token, a, b, pre) {
    return new Promise(function (resolve) {
      function step() {
        if (token !== runToken) { resolve(null); return; }
        const t0 = performance.now(); let r;
        try { do { r = gen.next(); if (!r.done) progress(a + (b - a) * r.value.frac, (pre || "") + (pre ? r.value.stage.charAt(0).toLowerCase() + r.value.stage.slice(1) : r.value.stage)); } while (!r.done && performance.now() - t0 < 30); }
        catch (e) { showError(e.message); resolve(null); return; }
        if (r.done) resolve(r.value); else setTimeout(step, 0);
      }
      step();
    });
  }
  // the reference: a dilute sample of the same particles, filmed the same way, for the amplitude of one particle alone
  let refMovieHere = null, refHere = {}, refKeyHere = null;
  async function runHere(kind, token, cfg, opts) {
    let movie = cache.movie;
    if (kind === "simulate" || !movie) {
      movie = await drive(MOVIE.simulate(cfg), token, 0, 0.75); if (!movie) return;
      const rc = CROWD.referenceConfig(cfg, movie.truth.interact.tau_B_s), rk = JSON.stringify(rc);
      if (rk !== refKeyHere) {
        refKeyHere = null; refMovieHere = await drive(MOVIE.simulate(rc), token, 0.75, 0.82, "Dilute reference movie: "); if (!refMovieHere) return;
        refHere = {}; refKeyHere = rk;
      }
    }
    const wk = opts.windowing ? "w" : "n";
    if (!refHere[wk]) { refHere[wk] = await drive(CROWD.referenceAmplitude(refMovieHere, { windowing: !!opts.windowing }), token, 0.82, 0.85, "Dilute reference movie: "); if (!refHere[wk]) return; }
    const o2 = Object.assign({}, opts, { reference: refHere[wk], n_labelled: movie.truth.interact.n_labelled, D0_um2_s: movie.truth.interact.D0_um2_s });
    const res = await drive(CROWD.analyse(movie, o2), token, 0.85, opts.compare_published ? 0.93 : 1);
    if (!res) return;
    if (opts.compare_published) { let rp = null; try { rp = await drive(CROWD.analyse(movie, Object.assign({}, o2, { published_only: true })), token, 0.93, 1); } catch (e) { rp = null; } res.published = rp ? CROWD.publishedSummary(rp) : { failed: "too little to work with" }; }
    inflight = null;
    finish(movie, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  function finish(movie, res, cfg, opts) {
    document.querySelector(".steps").classList.remove("stale");
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    // a new movie: the delay slider in the middle of the delays where the beads moved measurably, and the lower map zoomed on
    // the patterns used
    if (fresh) {
      // the delay at which the patterns at the peak of S(q) are half renewed (else the middle of the delays measured)
      let tw = halfTime(res.rows[res.peak.k]) || Math.sqrt(res.taus_s[0] * res.taus_s[res.taus_s.length - 1]);
      const ta = res.taus_s;
      let li = 0; for (let k = 0; k < ta.length; k++) if (Math.abs(Math.log(ta[k] / tw)) < Math.abs(Math.log(ta[li] / tw))) li = k;
      $("lag").max = ta.length - 1; $("lag").value = li;
      cache.zoomK = Math.max(8, Math.min(movie.n / 2 - 1, Math.round(res.window.q_max_used * movie.L_um / (2 * Math.PI)) + 2));
    }
    $("btn-times").hidden = !frameTimes();
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames of " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " particles, " + movie.truth.interact.n_labelled + " of them dyed."; idle();
    frameIdx = 0; playT = 0;
    renderAll();
  }

  // ---- colours ---------------------------------------------------------------------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ["ink", "muted", "rule", "accent", "accent-2", "tint", "paper", "panel", "good", "warn", "bad"].forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim(); });
  }
  function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join(""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function qColor(t) {
    t = Math.max(0, Math.min(1, t));
    const a = hexToRgb(C.accent), b = hexToRgb(C["accent-2"]);
    const mid = [Math.round((a[0] + b[0]) / 2 + 20), Math.round((a[1] + b[1]) / 2 - 25), Math.round((a[2] + b[2]) / 2 + 10)];
    const c = t < 0.5 ? lerp3(a, mid, t * 2) : lerp3(mid, b, (t - 0.5) * 2);
    return "rgb(" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); }).join(",") + ")";
  }
  const MAGMA = [[0, 0, 4], [44, 17, 95], [114, 31, 129], [183, 55, 121], [241, 96, 93], [254, 176, 120], [252, 253, 191]];
  function magma(t) { t = Math.max(0, Math.min(1, t)) * (MAGMA.length - 1); const i = Math.min(MAGMA.length - 2, Math.floor(t)); return lerp3(MAGMA[i], MAGMA[i + 1], t - i); }

  // ---- field of view: Ti2 field, sensor, ROI, simulated part ----------------------------
  function drawFov() {
    const cv = $("fov"); if (!cv) return;
    readColors();
    const c = prepCanvas(cv), ctx = c.ctx, W = c.W, H = c.H;
    const mag = objective().m, scanning = SCANNING();
    const fieldUm = FIELD_NUMBER_MM * 1000 / mag;
    let chipW = 0, chipH = 0, roiUm, label;
    if (scanning) { roiUm = scanFieldUm(); label = "scan field"; }
    else { const k = cam(); chipW = k.cols * k.px / mag; chipH = k.rows * k.px / mag; roiUm = state.roi * k.px / mag; label = "sensor"; }
    const simUm = simPx() * pixelUm();
    const S = Math.min(W, H) * 0.92 / Math.max(fieldUm, Math.hypot(chipW, chipH) * 0.0 + Math.max(chipW, chipH, 0)), cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.tint; ctx.beginPath(); ctx.arc(cx, cy, fieldUm * S / 2, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.stroke();
    const rect = function (wu, hu, col, fill, lw) { const w = wu * S, h = hu * S; if (fill) { ctx.fillStyle = fill; ctx.fillRect(cx - w / 2, cy - h / 2, w, h); } ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(cx - w / 2, cy - h / 2, w, h); };
    if (!scanning) rect(chipW, chipH, C.ink, null, 1.2);
    rect(roiUm, roiUm, C.accent, null, 2);
    rect(simUm, simUm, C["accent-2"], C["accent-2"], 1.5);
    ctx.font = "12px " + getComputedStyle(document.body).getPropertyValue("--sans");
    ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("field " + fmtSig(fieldUm, 3) + " " + MU + "m", cx, cy - fieldUm * S / 2 + 14);
    if (!scanning) { ctx.textBaseline = "bottom"; ctx.fillStyle = C.ink; ctx.fillText("sensor " + fmtSig(chipW, 3) + " x " + fmtSig(chipH, 3) + " " + MU + "m", cx, cy - chipH * S / 2 - 3); }
    const qloROI = 2 * Math.PI / roiUm, qloSim = 2 * Math.PI / simUm;
    $("fov-legend").innerHTML =
      '<span><i style="background:' + C.accent + '"></i>' + (scanning ? "Scanned area: " : "Region of interest: ") + outPx() + " x " + outPx() + " pixels, " + fmtSig(roiUm, 3) + " " + MU + "m</span>" +
      '<span><i style="background:' + C["accent-2"] + '"></i>Simulated here: ' + simPx() + " x " + simPx() + " pixels, " + fmtSig(simUm, 3) + " " + MU + "m</span>";
    let txt;
    if (scanning) {
      txt = "Pixel <b>" + fmtSig(pixelUm(), 3) + " " + MU + "m</b> at the sample. " + SCANNERS[state.scanner].label + " scanner: one line every " + fmtSig(lineTime() * 1e6, 3) + " " + MU + "s" + (state.line_avg > 1 ? " (" + state.line_avg + " passes)" : "") + ", so the bottom row is recorded " + fmtSig(state.scan_px * lineTime() * 1000, 3) + " ms after the top one. Fastest frame rate: <b>" + fmtNum(maxFps()) + " frames/s</b>.";
    } else {
      const k = cam(), diag = Math.hypot(k.cols, k.rows) * k.px / 1000;
      txt = "Pixel <b>" + fmtSig(pixelUm(), 3) + " " + MU + "m</b> at the sample (" + k.px + " " + MU + "m x " + state.binning + " / " + mag + "x). Fastest frame rate for this region: <b>" + fmtNum(maxFps()) + " frames/s</b> (" + k.ifaces[state.iface] + "). " +
        (k.timing === "global" ? "Global shutter: all rows are exposed together. " : "Rolling shutter: " + (k.timing === "rolling_center" ? "rows are read from the centre outwards" : "rows are read from the top down") + ", the last " + fmtSig(1000 * (k.timing === "rolling_center" ? state.roi / 2 : state.roi) * k.rowTime(state.cam_mode), 3) + " ms after the first. ") +
        (diag > FIELD_NUMBER_MM ? "The sensor diagonal (" + fmtSig(diag, 3) + " mm) is larger than the 25 mm field, so its corners stay dark. " : "");
    }
    if (simPx() < outPx()) txt += " Your browser simulates the central " + simPx() + " x " + simPx() + " pixels; the full image would also show " + (level === "curious" ? "stripes up to " + fmtSig(2 * Math.PI / qloROI, 2) + " " + MU + "m wide instead of " + fmtSig(2 * Math.PI / qloSim, 2) + "." : "wider stripes, down to q = 2&pi; / spacing = " + fmtSig(qloROI, 2) + " " + MU + "m<sup>-1</sup> instead of " + fmtSig(qloSim, 2) + ".");
    $("fov-specs").innerHTML = txt;
  }

  // ---- one particle, through focus (from the computed kernel) ----------------------------
  // particles built from terms (polarisers, anisotropic or birefringent particles): sum of point images per channel
  function drawParticleTerms() {
    const info = cache.movie.info, P = info.particle, q = info.kernel_q, nq = q.length, dq = q[1] - q[0];
    const chans = info.split ? [["het", info.channels.het], ["hom", info.channels.hom]] : [["all", info.kernel]];
    const host = $("particle-strip"); host.innerHTML = "";
    const a = pixelUm() / 2, Npx = 41, half = (Npx - 1) / 2, NR = 128;
    const rmax = half * a * Math.SQRT2 + (P.geometry ? P.geometry.a_par : 0) + 0.5;
    const prof = {};
    const profile = function (name, K, zp) {
      const z = K.z_um, nz = z.length; let iz = 0; for (let j = 0; j < nz; j++) if (Math.abs(z[j] - zp) < Math.abs(z[iz] - zp)) iz = j;
      const key = name + iz; if (prof[key]) return prof[key];
      const out = new Float64Array(NR + 1);
      for (let ir = 0; ir <= NR; ir++) { const r = rmax * ir / NR; let sum = 0; for (let iq = 0; iq < nq; iq++) sum += K.Kr[iq * nz + iz] * OPTICS.besselJ0(q[iq] * r) * q[iq]; out[ir] = sum * dq / (2 * Math.PI); }
      prof[key] = out; return out;
    };
    let views;
    const c45 = Math.SQRT1_2;
    if (P.oriented && P.shape === "bisphere") views = [0, 22.5, 45, 67.5, 90].map(function (d) { const t = d * Math.PI / 180; return { u: [Math.cos(t), Math.sin(t), 0], z: 0, cap: "axis " + d + DEG }; });
    else if (P.oriented) views = [{ u: [1, 0, 0], z: 0, cap: "lying, along x" }, { u: [c45, c45, 0], z: 0, cap: "lying, at 45" + DEG }, { u: [c45, 0, c45], z: 0, cap: "tilted 45" + DEG }, { u: [Math.sin(0.35), 0, Math.cos(0.35)], z: 0, cap: "nearly upright" }, { u: [0, 0, 1], z: 0, cap: "upright" }];
    else views = [-4, -2, 0, 2, 4].map(function (v) { const zz = v * Math.max(0.5, Math.min(2, centralWavelength() / objective().na / 1.1)); return { u: [0, 0, 1], z: zz, cap: Math.abs(zz) < 1e-6 ? "in focus" : fmtSig(Math.abs(zz), 2) + " " + MU + "m " + (zz < 0 ? "above" : "below") }; });
    const imgs = [];
    views.forEach(function (vw) {
      const I = new Float64Array(Npx * Npx), terms = MOVIE.particleTerms(info, vw.u[0], vw.u[1], vw.u[2]);
      terms.forEach(function (tm) {
        chans.forEach(function (ch) {
          const K = ch[1], w = tm[ch[0]]; if (!K || !w) return;
          const pr = profile(ch[0], K, vw.z + tm.z);
          for (let y = 0; y < Npx; y++) for (let x = 0; x < Npx; x++) {
            const r = Math.hypot((x - half) * a - tm.x, (half - y) * a - tm.y), t = r / rmax * NR, i = Math.min(NR - 1, Math.floor(t)), f = t - i;
            I[y * Npx + x] += w * (pr[i] + f * (pr[i + 1] - pr[i]));
          }
        });
      });
      imgs.push(I);
    });
    const bgs = info.dark ? 0 : (P.background_share === undefined ? 1 : P.background_share), onBlack = info.dark || bgs < 0.01 || !TRANS();
    let vmax = 0; imgs.forEach(function (I) { for (let k = 0; k < I.length; k++) vmax = Math.max(vmax, onBlack ? bgs + I[k] : Math.abs(I[k])); });
    imgs.forEach(function (I, n) {
      const fig = document.createElement("figure"); fig.className = "pz";
      const cv = document.createElement("canvas"); cv.width = Npx; cv.height = Npx; cv.setAttribute("aria-hidden", "true");
      const ctx = cv.getContext("2d"), img = ctx.createImageData(Npx, Npx), d = img.data;
      for (let k = 0; k < Npx * Npx; k++) { const g = onBlack ? 255 * Math.max(0, bgs + I[k]) / (vmax || 1) : 128 + 120 * I[k] / (vmax || 1); d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = Math.max(0, Math.min(255, g)); d[4 * k + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      const cap = document.createElement("figcaption"); cap.textContent = views[n].cap;
      fig.appendChild(cv); fig.appendChild(cap); host.appendChild(fig);
    });
    const pol = cache.cfg.polarization;
    let txt = P.oriented ? "Each picture is one particle in focus with its axis in a different direction" + (P.shape === "bisphere" ? " in the image plane, measured from the polarizer" : "") + "." : "Each picture is one particle at that distance from focus.";
    if (pol && pol.analyzer_deg !== null && pol.analyzer_deg !== undefined) txt += " Between the polarizers only light whose polarization the particle turns gets through" + (Math.round(pol.analyzer_deg) === 90 ? ": a sphere of ordinary material would vanish, a birefringent one is brightest at 45" + DEG + "." : ".");
    else if (pol) txt += " The light is polarized along x.";
    if (P.oriented && state.mode === "darkfield") txt += " In dark field the brightness changes as the particle tilts: this blinking is what reveals the rotation.";
    if (P.body) txt += " Computed in the Rayleigh-Gans approximation from " + P.points.n + " small scatterers filling the particle.";
    $("particle-text").textContent = txt;
  }
  function drawParticle() {
    if (cache.movie.info.split || (cache.movie.info.particle && cache.movie.info.particle.body)) { drawParticleTerms(); return; }
    const info = cache.movie.info, Kk = info.kernel, q = info.kernel_q, z = Kk.z_um, nz = z.length, nq = q.length, nd = Kk.nd;
    const host = $("particle-strip"); host.innerHTML = "";
    const want = [-4, -2, 0, 2, 4].map(function (v) { return v * Math.max(0.5, Math.min(2, centralWavelength() / objective().na / 1.1)); });
    const a = pixelUm() / 2, Npx = 41, half = (Npx - 1) / 2;   // drawn at half the camera pixel
    const imgs = [];
    let vmax = 0;
    const dq = q[1] - q[0], NA_ = nd > 1 ? 48 : 0;
    want.forEach(function (zw) {
      if (zw < z[0] || zw > z[nz - 1]) { imgs.push(null); return; }
      let iz = 0; for (let j = 0; j < nz; j++) if (Math.abs(z[j] - zw) < Math.abs(z[iz] - zw)) iz = j;
      const I = new Float64Array(Npx * Npx);
      if (nd === 1) {
        // rotationally symmetric: inverse Hankel transform I(r) = (1 / 2 pi) int K(q) J0(q r) q dq
        const rmax = half * a * Math.SQRT2, NR = 64, P = new Float64Array(NR + 1);
        for (let ir = 0; ir <= NR; ir++) { const r = rmax * ir / NR; let sum = 0; for (let iq = 0; iq < nq; iq++) sum += Kk.Kr[iq * nz + iz] * OPTICS.besselJ0(q[iq] * r) * q[iq]; P[ir] = sum * dq / (2 * Math.PI); }
        for (let y = 0; y < Npx; y++) for (let x = 0; x < Npx; x++) { const t = Math.hypot(x - half, y - half) * a / rmax * NR, i = Math.min(NR - 1, Math.floor(t)), f = t - i; I[y * Npx + x] = P[i] + f * (P[i + 1] - P[i]); }
      } else {
        // direction-dependent (DIC): I(x) = (1 / 4 pi^2) sum over q and angle of K e^{i q . x} q dq dtheta, angles interpolated
        for (let ia = 0; ia < NA_; ia++) {
          const th = Math.PI * ia / NA_, ta = th / (Math.PI / nd), d0 = Math.floor(ta) % nd, fa = ta - Math.floor(ta), d1 = (d0 + 1) % nd, wrap = d0 + 1 === nd;
          const ct = Math.cos(th), st = Math.sin(th);
          for (let iq = 1; iq < nq; iq++) {
            const o0 = (d0 * nq + iq) * nz + iz, o1 = (d1 * nq + iq) * nz + iz;
            const kr = Kk.Kr[o0] + fa * (Kk.Kr[o1] - Kk.Kr[o0]), ki = Kk.Ki[o0] + fa * ((wrap ? -Kk.Ki[o1] : Kk.Ki[o1]) - Kk.Ki[o0]);
            const w = q[iq] * dq * (Math.PI / NA_) / (4 * Math.PI * Math.PI) * 2;   // the half-plane theta + pi is the complex conjugate: 2 Re
            for (let y = 0; y < Npx; y++) for (let x = 0; x < Npx; x++) {
              const ph = q[iq] * ((x - half) * a * ct + (half - y) * a * st);
              I[y * Npx + x] += w * (kr * Math.cos(ph) - ki * Math.sin(ph));
            }
          }
        }
      }
      for (let p = 0; p < I.length; p++) vmax = Math.max(vmax, Math.abs(I[p]));
      imgs.push({ z: z[iz], I: I });
    });
    const grey = TRANS() && state.mode !== "darkfield";
    imgs.forEach(function (p) {
      const fig = document.createElement("figure"); fig.className = "pz";
      const cv = document.createElement("canvas"); cv.width = Npx; cv.height = Npx; cv.setAttribute("aria-hidden", "true");
      const cap = document.createElement("figcaption");
      if (p) {
        const ctx = cv.getContext("2d"), img = ctx.createImageData(Npx, Npx), d = img.data;
        for (let k = 0; k < Npx * Npx; k++) { const v = p.I[k], g = grey ? 128 + 120 * v / vmax : 255 * Math.max(0, v) / vmax; d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = Math.max(0, Math.min(255, g)); d[4 * k + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        cap.textContent = Math.abs(p.z) < 1e-6 ? "in focus" : fmtSig(Math.abs(p.z), 2) + " " + MU + "m " + (p.z < 0 ? "above" : "below");
      } else cap.textContent = "outside the cell";
      fig.appendChild(cv); fig.appendChild(cap); host.appendChild(fig);
    });
    const lam = centralWavelength(), m = nParticle(lam) / nLiquid(lam);
    const what = fmtSize(state.diameter_um) + " " + MATERIALS[state.particle].toLowerCase().replace(" (set the index)", "") + " particle";
    let txt;
    if (state.mode === "darkfield") txt = "Each picture is the light a single " + what + " scatters into the objective; nothing else reaches the camera.";
    else if (TRANS()) txt = "Each picture is the light a single " + what + " changes, computed from Mie scattering and the microscope's optics" + (state.mode === "phase" ? ", including the phase ring" : state.mode === "dic" ? ", including the DIC prisms (note the relief along the shear)" : "") + ". Index ratio " + m.toFixed(3) + ". Grey is the background; the contrast is stretched " + fmtSig(1 / Math.max(1e-9, vmax), 2) + " times.";
    else txt = "Each picture is the light from a single fluorescent particle at that distance from focus" + (state.mode === "spinning" || state.mode === "scanning" ? "; the pinholes reject most light from out of focus." : ".");
    if (TRANS() && Math.abs(m - 1) < 0.01) txt += " The particle and the liquid have almost the same refractive index, so it nearly vanishes.";
    $("particle-text").textContent = txt;
  }

  // ---- movie and images ----------------------------------------------------------------
  let frameIdx = 0, playing = true, lastTick = 0, accum = 0, playT = 0;
  // log-spaced frames: how much faster than real time the movie plays (at least real time, about 20 s on screen)
  function playSpeed() { const tt = cache.movie.times_s; return tt ? Math.max(1, (tt[cache.movie.T - 1] + 1 / cache.movie.frame_rate_hz) / 20) : 1; }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) playing = false;
  let grey = null;
  function greyRange(movie) {
    const n2 = movie.n * movie.n, vals = Array.from(movie.frames.subarray(0, n2)).sort(function (a, b) { return a - b; });
    return [vals[Math.floor(0.001 * n2)], vals[Math.floor(0.999 * n2)]];
  }
  function drawFrame(canvas, movie, t) {
    const n = movie.n;
    if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    const off = t * n * n, lo = grey[0], span = grey[1] - grey[0] || 1;
    for (let p = 0; p < n * n; p++) { const v = Math.max(0, Math.min(255, 255 * (movie.frames[off + p] - lo) / span)); d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = v; d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function lagIndex() { return Math.min(parseInt($("lag").value, 10), cache.res.lags.length - 1); }
  function lagFrames() { return cache.res.lags[lagIndex()]; }
  let diffScale = null;
  function drawDiff(t) {
    const movie = cache.movie, n = movie.n, m = lagFrames(), pr = cache.res.pairs ? cache.res.pairs[lagIndex()] : null;
    // evenly spaced frames: frame t and frame t + lag; log-spaced: the pairs of frames that are this far apart, in turn
    const k = pr ? t % (pr.length / 2) : 0, f1 = pr ? pr[2 * k] : t % (movie.T - m), f2 = pr ? pr[2 * k + 1] : f1 + m, c = $("diff");
    if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    const o1 = f1 * n * n, o2 = f2 * n * n;
    if (diffScale === null) {
      const pl = cache.res.pairs ? cache.res.pairs[cache.res.pairs.length - 1] : null, M1 = pl ? pl[0] : 0, M2 = pl ? pl[1] : cache.res.lags[cache.res.lags.length - 1]; let s = 0;
      for (let p = 0; p < n * n; p++) { const v = movie.frames[M2 * n * n + p] - movie.frames[M1 * n * n + p]; s += v * v; }
      diffScale = 3 * Math.sqrt(s / (n * n)) || 1;
    }
    for (let p = 0; p < n * n; p++) { const v = 128 + 127 * (movie.frames[o2 + p] - movie.frames[o1 + p]) / diffScale; d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = Math.max(0, Math.min(255, v)); d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function tick(now) {
    if (cache.movie && cache.res && playing) {
      const tt = cache.movie.times_s;
      if (tt) {
        // log-spaced frames: played on the clock of the experiment (sped up so that the movie lasts about 20 s), each frame
        // shown from its own time to the next one's; shown one after the other, every bead would jump together at each gap
        const span = tt[cache.movie.T - 1] + 1 / cache.movie.frame_rate_hz, sp = playSpeed();
        playT += Math.min(0.1, (now - lastTick) / 1000) * sp;
        if (playT >= span) playT = 0;
        let k = frameIdx; if (tt[k] > playT) k = 0;
        while (k < cache.movie.T - 1 && tt[k + 1] <= playT) k++;
        if (k !== frameIdx || playT === 0) { frameIdx = k; drawMovieFrames(); }
      } else {
        const fps = Math.max(8, Math.min(60, cache.movie.frame_rate_hz));
        accum += Math.min(0.1, (now - lastTick) / 1000) * fps;
        if (accum >= 1) { frameIdx = (frameIdx + Math.floor(accum)) % cache.movie.T; accum -= Math.floor(accum); drawMovieFrames(); }
      }
    }
    lastTick = now;
    requestAnimationFrame(tick);
  }
  function drawMovieFrames() {
    drawFrame($("movie"), cache.movie, frameIdx);
    drawFrame($("hero-canvas"), cache.movie, frameIdx);
    drawDiff(frameIdx);
    const dt = 1 / cache.movie.frame_rate_hz, fps = Math.max(8, Math.min(60, cache.movie.frame_rate_hz)), speed = fps / cache.movie.frame_rate_hz, tt = cache.movie.times_s;
    if (tt) { const sp = playSpeed(); $("movie-time").textContent = "t = " + fmtSig(tt[frameIdx], 3) + " s of " + fmtDur(tt[cache.movie.T - 1] + dt) + ", frame " + (frameIdx + 1) + " of " + cache.movie.T + (sp > 1.01 ? ", played " + fmtNum(sp) + " times faster than real time" : ", real time") + ". The frames are log-spaced: between two of them the picture holds."; return; }
    $("movie-time").textContent = "t = " + (frameIdx * dt).toFixed(dt < 0.01 ? 3 : dt < 0.1 ? 2 : 1) + " s of " + fmtSig(cache.movie.T * dt, 3) + " s" +
      (Math.abs(speed - 1) > 0.01 ? (speed < 1 ? ", slowed down " + fmtNum(1 / speed) + " times" : ", sped up " + fmtNum(speed) + " times") : ", real time");
  }

  // ---- map and stripe pattern ------------------------------------------------------------
  let sel = null;
  // a pattern in the middle of the q used
  function pickDefaultSelection() {
    const res = cache.res, n = cache.movie.n, b = res.bins[Math.floor(res.bins.length / 2)] || 6;
    if (!sel || Math.hypot(sel.kx, sel.ky) > n / 2) sel = { kx: Math.max(1, Math.round(b * Math.cos(0.5))), ky: Math.max(1, Math.round(b * Math.sin(0.5))) };
  }
  // amplitude and noise of a q bin (null outside the bins used)
  function ampOf(b) { const r = cache.res; return b > 0 && r.A[b] > 0 && r.bins.indexOf(b) >= 0 ? { A: r.A[b], B: r.B[b] } : null; }
  function selBin() { return Math.round(Math.hypot(sel.kx, sel.ky)); }
  // pixel (X, Y) of the drawn map (q = 0 in the middle, ky up) to the index of the Fourier array (iy rows, ky down the image)
  function mapIndex(X, Y, n) { const kx = X - n / 2, ky = n / 2 - Y, ix = (kx + n) % n, iy = (-ky + n) % n; return iy * n + ix; }
  function drawMap() {
    const res = cache.res, n = cache.movie.n, map = res.d2d[lagIndex()];
    const c = $("map"); if (c.width !== n) { c.width = n; c.height = n; }
    const vals = []; for (let p = 1; p < n * n; p++) if (map[p] > 0) vals.push(Math.log10(map[p]));
    vals.sort(function (a, b) { return a - b; });
    const lo = vals[Math.floor(0.02 * vals.length)], hi = vals[Math.floor(0.999 * vals.length)];
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let Y = 0; Y < n; Y++) for (let X = 0; X < n; X++) {
      const v = map[mapIndex(X, Y, n)], col = magma(v > 0 ? (Math.log10(v) - lo) / (hi - lo) : 0), p = 4 * (Y * n + X);
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    drawMapOverlay(); drawFmap();
    const qz = cache.zoomK * 2 * Math.PI / cache.movie.L_um;
    $("zoom-note").textContent = "The centre of the map above, lightly smoothed (grey: the cross along the axes, left out because the edges of the image add artefacts there), " + (level === "curious" ? "stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m" : "q up to " + fmtSig(qz, 2) + " " + MU + "m\u207b\u00b9 (stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m)") + ", at the same delay.";
  }
  function drawMapOverlay() {
    const ov = $("map-ov"), n = cache.movie.n, S = ov.width, s = S / n;
    const ctx = ov.getContext("2d"); ctx.clearRect(0, 0, S, S);
    const cx = S / 2 + 0.5 * s, cy = S / 2 + 0.5 * s;
    const kopt = cache.res.window.q_opt_per_um * cache.movie.L_um / (2 * Math.PI);
    ctx.lineWidth = 2;
    if ($("kopt-note")) $("kopt-note").hidden = !(kopt < n / 2);
    if (level !== "curious" && kopt < n / 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, kopt * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    const kpk = hasPeak(cache.res) ? cache.res.peak.q_per_um * cache.movie.L_um / (2 * Math.PI) : 0;
    if ($("peak-note")) $("peak-note").hidden = !(kpk > 0);
    if (kpk > 0 && kpk < n / 2) { ctx.setLineDash([2, 5]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, kpk * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    const px = cx + sel.kx * s, py = cy - sel.ky * s;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(2 * cx - px, 2 * cy - py, 6, 0, 2 * Math.PI); ctx.stroke();
  }
  // how much of each pattern is left after the delay, f = 1 - (d - B)/A: red where it is still there, white where it has
  // faded, blue where it came back with the opposite sign (only a drift can do that)
  function divColor(f) {
    const t = Math.max(-1, Math.min(1, f)), a = hexToRgb(C["accent-2"]), b = hexToRgb(C.accent), w = hexToRgb(C.panel);
    const c = t >= 0 ? lerp3(w, a, t) : lerp3(w, b, -t);
    return c.map(function (v) { return Math.round(v); });
  }
  // the lower maps show the centre of the Fourier plane, (2K + 1) pixels wide: pixel (X, Y) to the Fourier array index
  function zoomIndex(X, Y, K, n) { const kx = X - K, ky = K - Y; return ((-ky + n) % n) * n + ((kx + n) % n); }
  // the lower maps, lightly smoothed (weights 1-2-1 over the neighbouring pixels): each pixel alone is noisy, because
  // the widest patterns change slowly and the movie holds few independent looks at them
  function smoothed(K, n, value) {
    const m = 2 * K + 1, out = new Array(m * m);
    for (let Y = 0; Y < m; Y++) for (let X = 0; X < m; X++) {
      const i0 = zoomIndex(X, Y, K, n); if (!ampOf(cache.res.binOf[i0])) { out[Y * m + X] = null; continue; }
      let w = 0, a = 0, bb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = zoomIndex(X + dx, Y + dy, K, n), v = value(i); if (!v) continue;
        const wt = (2 - Math.abs(dx)) * (2 - Math.abs(dy)); w += wt; a += wt * v[0]; bb += wt * v[1];
      }
      out[Y * m + X] = w > 0 ? [a / w, bb / w] : null;
    }
    return out;
  }
  function drawFmap() {
    const res = cache.res, n = cache.movie.n, map = res.d2d[lagIndex()], c = $("fmap"); if (!c) return;
    const K = cache.zoomK, m = 2 * K + 1; if (c.width !== m) { c.width = m; c.height = m; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(m, m), d = img.data, grey = hexToRgb(C.rule);
    const f = smoothed(K, n, function (i) { const e = ampOf(res.binOf[i]); return e ? [1 - (map[i] - e.B) / e.A, 0] : null; });
    for (let k = 0; k < m * m; k++) { const col = f[k] ? divColor(f[k][0]) : grey, p = 4 * k; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function drawStripes() {
    const n = cache.movie.n, c = $("stripes"); if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 128 + 110 * Math.cos(2 * Math.PI * (sel.kx * x + sel.ky * (n - 1 - y)) / n), p = 4 * (y * n + x); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = Math.hypot(sel.kx, sel.ky), q = 2 * Math.PI * k / cache.movie.L_um, spacing = cache.movie.L_um / k, ang = ((Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI) % 180) + 180) % 180;
    let txt = "Stripe spacing <b>" + fmtSig(spacing, 2) + " " + MU + "m</b>";
    if (level !== "curious") txt += ", q = <b>" + q.toFixed(2) + " " + MU + "m<sup>-1</sup></b>, direction " + ang + "&deg;";
    // the delay at which half of this pattern is renewed, from the measured curve of the nearest q used
    const rows = cache.res.rows; let rk = 0; rows.forEach(function (r, i) { if (Math.abs(r.q_per_um - q) < Math.abs(rows[rk].q_per_um - q)) rk = i; });
    const near = Math.abs(rows[rk].q_per_um - q) < 0.15 * q, th = near ? halfTime(rows[rk]) : null;
    txt += !near ? ". Outside the patterns used (too faint against the camera noise)" : th ? ". The particles renew half of it in about <b>" + fmtTime(th) + "</b>" : rows[rk].f[0] < 0.5 ? ". The particles renew half of it faster than the shortest delay" : ". Within the movie the particles never renew half of it";
    $("pick-out").innerHTML = txt + "."; syncPick();
  }
  // the same choice from the keyboard: two sliders under the map, stripe spacing (wide to fine) and direction
  function setPick() {
    if (!cache.res) return;
    const k = +$("pick-k").value, a = +$("pick-a").value * Math.PI / 180;
    let kx = Math.round(k * Math.cos(a)), ky = Math.round(k * Math.sin(a)); if (kx === 0 && ky === 0) kx = 1;
    sel = { kx: kx, ky: ky }; fromSlider = true; drawMapOverlay(); drawStripes();
  }
  // the pixel nearest to the sliders' setting stands for it; the sliders keep their own value, so that small steps add up
  let fromSlider = false;
  function syncPick() {
    const n = cache.movie.n, k = Math.hypot(sel.kx, sel.ky), deg = ((Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI) % 180) + 180) % 180, pk = $("pick-k"), pa = $("pick-a");
    pk.max = Math.floor(n / 2) - 1;
    if (!fromSlider) { pk.value = Math.round(k); pa.value = deg; }
    fromSlider = false;
    pk.setAttribute("aria-valuetext", "stripe spacing " + fmtSig(cache.movie.L_um / k, 2) + " micrometres");
    pa.setAttribute("aria-valuetext", deg + " degrees");
  }
  function onMapClick(ev) {
    if (!cache.res) return;
    const ov = $("map-ov"), rect = ov.getBoundingClientRect(), n = cache.movie.n;
    const X = Math.floor((ev.clientX - rect.left) / rect.width * n), Y = Math.floor((ev.clientY - rect.top) / rect.height * n);
    const kx = X - n / 2, ky = n / 2 - Y; if (kx === 0 && ky === 0) return;
    sel = { kx: kx, ky: ky }; drawMapOverlay(); drawStripes();
  }

  // ---- charts -----------------------------------------------------------------------------
  function prepCanvas(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.max(200, Math.round(r.width)), H = Math.max(150, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: W, H: H };
  }
  function niceStep(raw) { const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; }
  function axes(canvas, o) {
    const c = prepCanvas(canvas), ctx = c.ctx, m = { l: 58, r: 14, t: 12, b: 44 }, pw = c.W - m.l - m.r, ph = c.H - m.t - m.b;
    const fx = o.xlog ? function (v) { return m.l + pw * (Math.log10(v) - Math.log10(o.x0)) / (Math.log10(o.x1) - Math.log10(o.x0)); } : function (v) { return m.l + pw * (v - o.x0) / (o.x1 - o.x0); };
    const fy = o.ylog ? function (v) { return m.t + ph * (1 - (Math.log10(v) - Math.log10(o.y0)) / (Math.log10(o.y1) - Math.log10(o.y0))); } : function (v) { return m.t + ph * (1 - (v - o.y0) / (o.y1 - o.y0)); };
    ctx.font = "12px " + getComputedStyle(document.body).getPropertyValue("--sans");
    ctx.strokeStyle = C.rule; ctx.fillStyle = C.muted; ctx.lineWidth = 1;
    const ticks = function (lo, hi, log) {
      const out = [];
      if (log) { for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push({ v: v, major: true }); [2, 5].forEach(function (k) { const w = k * v; if (w >= lo && w <= hi) out.push({ v: w, major: false }); }); } }
      else { const step = niceStep((hi - lo) / 5); for (let i = Math.ceil(lo / step); i * step <= hi + 1e-9; i++) out.push({ v: Math.abs(i) < 1e-9 ? 0 : i * step, major: true }); }
      return out;
    };
    const lab = function (v, log) { if (!log) return fmtSig(v, 2).replace(/^-0$/, "0"); const e = Math.log10(v); if (Math.abs(e - Math.round(e)) < 1e-9) return e >= -2 && e <= 3 ? fmtSig(v, 1) : "1e" + Math.round(e); return fmtSig(v, 1); };
    ticks(o.x0, o.x1, o.xlog).forEach(function (t) { const x = fx(t.v); ctx.globalAlpha = t.major ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.globalAlpha = 1; if (t.major || (pw > 380 && o.xlog)) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(lab(t.v, o.xlog), x, m.t + ph + 6); } });
    ticks(o.y0, o.y1, o.ylog).forEach(function (t) { const y = fy(t.v); ctx.globalAlpha = t.major ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.globalAlpha = 1; if (t.major) { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(lab(t.v, o.ylog), m.l - 6, y); } });
    ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(o.xlabel, m.l + pw / 2, c.H - 4);
    ctx.save(); ctx.translate(13, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "middle"; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    return { ctx: ctx, fx: fx, fy: fy, m: m, pw: pw, ph: ph, done: function () { ctx.restore(); } };
  }
  function dot(ctx, x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); } }
  let qSpan = null;
  function setQSpan() { const w = cache.res.window; qSpan = [w.q_min_used, w.q_max_used]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }
  // the delay at which a pattern is half renewed (f = 1/2), from its measured curve (log interpolation); null if never
  function halfTime(r) {
    if (!r) return null; const t = cache.res ? cache.res.taus_s : null, f = r.f; if (!t) return null;
    for (let i = 1; i < f.length; i++) if (f[i - 1] >= 0.5 && f[i] < 0.5) { const w = (f[i - 1] - 0.5) / (f[i - 1] - f[i]); return t[i - 1] * Math.pow(t[i] / t[i - 1], w); }
    return null;
  }
  // the true structure factor of the simulation, as the dyed particles show it: 1 + x (S - 1), smoothed over three q
  function trueS(q) {
    const tr = cache.movie.truth.interact, qs = tr.q_per_um; if (q < qs[0] || q > qs[qs.length - 1]) return null;
    let k = 0; while (k < qs.length - 2 && qs[k + 1] < q) k++;
    const w = (q - qs[k]) / (qs[k + 1] - qs[k]), sm = function (i) { const a = tr.S[Math.max(0, i - 1)], b = tr.S[i], c = tr.S[Math.min(qs.length - 1, i + 1)]; return (a + 2 * b + c) / 4; };
    const S = sm(k) * (1 - w) + sm(k + 1) * w;
    return 1 + tr.label_fraction * (S - 1);
  }
  function pyS(q) { const tr = cache.movie.truth.interact; return 1 + tr.label_fraction * (CROWD.percusYevick(tr.phi, q * tr.sigma_um) - 1); }
  // the true peak of S(q) within the q used
  function truePeak() {
    const w = cache.res.window; let best = null;
    for (let i = 0; i <= 200; i++) { const q = w.q_min_used + (w.q_max_used - w.q_min_used) * i / 200, v = trueS(q); if (v !== null && (!best || v > best.S)) best = { q_per_um: q, S: v }; }
    return best;
  }
  function pickRows(rows) {
    const nb = rows.length, pick = [];
    for (let i = 0; i < Math.min(5, nb); i++) pick.push(Math.round(i * (nb - 1) / Math.max(1, Math.min(5, nb) - 1)));
    const kp = cache.res.peak.k; if (pick.indexOf(kp) < 0) { let j = 0; pick.forEach(function (k, i) { if (Math.abs(k - kp) < Math.abs(pick[j] - kp)) j = i; }); if (j > 0 && j < pick.length - 1) pick[j] = kp; }
    return pick;
  }
  // five of the q used (one at the peak of S(q)): how much of each pattern is left, with the short-time line fitted
  function drawCurves() {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    const a = axes($("chart-curves"), { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.15, y1: 1.15, xlabel: "Delay (s)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    const pick = pickRows(res.rows);
    const pkk = hasPeak(res) ? res.peak.k : -1;
    pick.forEach(function (k) {
      const r = res.rows[k], col = k === pkk ? C.ink : qColor(qPos(r.q_per_um));
      if (k === pkk) { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); let on = false; r.f.forEach(function (f, li) { if (!isFinite(f)) return; const X = a.fx(taus[li]), Y = a.fy(Math.max(-0.15, Math.min(1.15, f))); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); }); ctx.stroke(); }
      if (r.rate_hz > 0 && level !== "curious") {
        ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.setLineDash([6, 4]); ctx.beginPath(); let on = false;
        for (let i = 0; i <= 120; i++) { const t = x0 * Math.pow(x1 / x0, i / 120), v = Math.exp(-r.rate_hz * t); if (v < 0.2) break; const X = a.fx(t), Y = a.fy(v); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      r.f.forEach(function (f, li) { if (isFinite(f)) dot(ctx, a.fx(taus[li]), a.fy(Math.max(-0.15, Math.min(1.15, f))), k === pkk ? 3.2 : 2.4, col, null); });
    });
    a.done();
    fillNumbers("curves-numbers", ["Delay (s)"].concat(pick.map(function (k) { return "q = " + fmtSig(res.rows[k].q_per_um, 3); })), taus.map(function (t, li) { return [t].concat(pick.map(function (k) { return res.rows[k].f[li]; })); }));
    const leg = $("curves-legend"); leg.innerHTML = "";
    pick.forEach(function (k) { const q = res.rows[k].q_per_um, s = document.createElement("span"); s.innerHTML = '<i style="background:' + (k === pkk ? C.ink : qColor(qPos(q))) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / q, 2) + " " + MU + "m" : "q = " + q.toFixed(2) + " " + MU + "m\u207b\u00b9") + (k === res.peak.k && hasPeak(res) ? (level === "curious" ? " (neighbours)" : " (peak of S)") : ""); leg.appendChild(s); });
  }
  // the structure factor: measured (dots), the simulation (line) and, for hard spheres, the Percus-Yevick theory (dashed)
  // before and after a prediction: S(q) and D(q) of the earlier run stay, as a dotted line
  let compare = null;
  function runLabel(phi, x) { return Math.round(100 * phi) + " %, " + (x >= 0.99 ? "all dyed" : x <= 0.1 ? "one in " + Math.round(1 / x) + " dyed" : Math.round(100 * x) + " % dyed"); }
  function takeSnapshot() {
    compare = null; const res = cache.res; if (!res) return; const tr = cache.movie.truth.interact;
    compare = { label: runLabel(tr.phi, tr.label_fraction), res0: res, D0: res.D0_um2_s, rows: res.rows.map(function (r) { return { q: r.q_per_um, S: r.S, D: r.D_um2_s }; }) };
  }
  function oldLine(a, val) {
    const ctx = a.ctx; ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.65; ctx.lineWidth = 2; ctx.setLineDash([2, 4]); ctx.beginPath(); let on = false;
    compare.rows.forEach(function (r) { const v = val(r); if (!(v > 0) || !isFinite(v)) { on = false; return; } const X = a.fx(r.q), Y = a.fy(v); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); });
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function cmpNote() {
    if (!compare) return null; const tr = cache.movie.truth.interact;
    return cache.res === compare.res0 ? "Computing the new run..." : "Dotted line: the earlier run (" + compare.label + "). Dots: now (" + runLabel(tr.phi, tr.label_fraction) + ").";
  }
  function drawSq() {
    const res = cache.res, rows = res.rows, tr = cache.movie.truth.interact, x1 = res.window.q_max_used * 1.08;
    let top = 1.3; rows.forEach(function (r) { top = Math.max(top, r.S + (r.S_err || 0)); });
    for (let i = 1; i <= 100; i++) { const v = trueS(x1 * i / 100); if (v) top = Math.max(top, v); }
    const cmpOn = compare && res !== compare.res0;
    if (cmpOn) compare.rows.forEach(function (r) { if (r.q <= x1 && isFinite(r.S)) top = Math.max(top, r.S); });
    const a = axes($("chart-sq"), { xlog: false, ylog: false, x0: 0, x1: x1, y0: 0, y1: top * 1.12, xlabel: level === "curious" ? "Stripes: wide on the left, fine on the right (q, " + MU + "m\u207b\u00b9)" : "q (" + MU + "m\u207b\u00b9)", ylabel: level === "curious" ? "How strong (dilute = 1)" : "S(q)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(1)); ctx.lineTo(a.m.l + a.pw, a.fy(1)); ctx.stroke(); ctx.setLineDash([]);
    const curve = function (f, col, dash, wd) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.beginPath(); let on = false; for (let i = 1; i <= 240; i++) { const q = x1 * i / 240, v = f(q); if (v === null || !isFinite(v)) { on = false; continue; } const X = a.fx(q), Y = a.fy(v); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); } ctx.stroke(); ctx.setLineDash([]); };
    if (tr.kind === "hard" && level !== "curious") curve(pyS, C.muted, [7, 4], 1.3);
    curve(trueS, C["accent-2"], [], 1.8);
    if (cmpOn) oldLine(a, function (r) { return r.S; });
    rows.forEach(function (r) {
      const X = a.fx(r.q_per_um), col = qColor(qPos(r.q_per_um));
      if (r.S_err > 0 && level !== "curious") { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(r.S - r.S_err)); ctx.lineTo(X, a.fy(r.S + r.S_err)); ctx.stroke(); }
      dot(ctx, X, a.fy(r.S), 2.8, col, null);
    });
    a.done();
    const ul = $("sq-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    if (compare) add(cmpNote());
    add(level === "curious" ? "Dots: how strong each pattern is in this movie, against the same particles far apart (a second, dilute movie), in the colours of step 5. Red line: how the simulated particles are really arranged. Above 1, patterns at the spacing of neighbours; below 1 at the wide patterns, which the crowd smooths out." : "Dots: S(q) = (A / N) / (A_ref / N_ref), the amplitude per dyed particle against a dilute movie of the same particles, filmed the same way (bars: scatter of neighbouring q about a smooth curve). Red line: the S(q) of the simulated particles" + (tr.label_fraction < 1 ? ", as the dyed ones show it, 1 + x (S - 1) with x = " + tr.label_fraction : "") + ".");
    if (tr.kind === "hard" && level !== "curious") add("Dashed: Percus-Yevick theory for hard spheres at volume fraction " + fmtSig(tr.phi, 2) + ".");
    if (TRANS() && level !== "curious") add("In transmitted light the finest patterns read S(q) too high in this simulation; in fluorescence and confocal, where each particle shines on its own, S(q) comes out cleanly.");
    if (level !== "curious") add("At the widest patterns DDM reads S higher than the simulation: each pattern collects particles over the depth in focus, so it also takes in density waves tilted along the axis of the microscope, which have a shorter wavelength and a higher S.");
  }
  // collective diffusion: D(q) = Gamma / q^2 against D0, with 1 / S(q) (the short-time value without hydrodynamic interactions)
  function drawDq() {
    const res = cache.res, rows = res.rows, D0 = res.D0_um2_s, x1 = res.window.q_max_used * 1.08;
    let top = 1.4; rows.forEach(function (r) { if (r.D_um2_s > 0) top = Math.max(top, (r.D_um2_s + (r.D_err_um2_s || 0)) / D0); });
    for (let i = 1; i <= 100; i++) { const v = trueS(x1 * i / 100); if (v) top = Math.max(top, 1 / v); }
    const cmpOn = compare && res !== compare.res0;
    // the earlier run may stretch the axis at most twofold, so the new dots stay readable; beyond that it runs off the top
    let oldMax = 0; if (cmpOn) compare.rows.forEach(function (r) { if (r.q <= x1 && r.D > 0) oldMax = Math.max(oldMax, r.D / compare.D0); });
    top = Math.min(Math.max(top, Math.min(oldMax, 2 * top)), 12);
    const offTop = oldMax > top * 1.1;
    const a = axes($("chart-dq"), { xlog: false, ylog: false, x0: 0, x1: x1, y0: 0, y1: top * 1.1, xlabel: level === "curious" ? "Stripes: wide on the left, fine on the right (q, " + MU + "m\u207b\u00b9)" : "q (" + MU + "m\u207b\u00b9)", ylabel: level === "curious" ? "How fast (alone = 1)" : "D(q) / D0" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(1)); ctx.lineTo(a.m.l + a.pw, a.fy(1)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.8; ctx.beginPath(); let on = false;
    for (let i = 1; i <= 240; i++) { const q = x1 * i / 240, v = trueS(q); if (!v) { on = false; continue; } const X = a.fx(q), Y = a.fy(Math.min(top * 1.1, 1 / v)); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); }
    ctx.stroke();
    if (cmpOn) oldLine(a, function (r) { return r.D / compare.D0; });
    rows.forEach(function (r) {
      if (!(r.D_um2_s > 0)) return; const X = a.fx(r.q_per_um), col = qColor(qPos(r.q_per_um)), v = r.D_um2_s / D0;
      if (r.D_err_um2_s > 0 && level !== "curious") { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(v - r.D_err_um2_s / D0)); ctx.lineTo(X, a.fy(v + r.D_err_um2_s / D0)); ctx.stroke(); }
      dot(ctx, X, a.fy(v), 2.8, col, null);
    });
    a.done();
    fillNumbers("chart-numbers", ["q (" + MU + "m\u207b\u00b9)", "S(q) measured", "S(q) simulated", "D(q)/D0 measured", "Expected at the shortest delays"], rows.map(function (r) { const t = trueS(r.q_per_um); return [r.q_per_um, r.S, t, r.D_um2_s > 0 ? r.D_um2_s / D0 : null, t ? 1 / t : null]; }));
    const ul = $("dq-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    const x = cache.movie.truth.interact.label_fraction, few = x <= 0.1;
    if (compare) add(cmpNote() + (cmpOn && offTop ? " At the widest patterns it runs off the top of the chart, up to " + fmtSig(oldMax, 2) + " times D0." : ""));
    if (level === "curious") {
      add("Dots: how fast each pattern fades at first, against the same particles far apart. " + (few ? "Red line: one particle on its own, right after the start. The dots sit below it: within the delays used, each dyed particle already bumps into its invisible neighbours, which hold it back." : "Red line: what to expect right after the start, before the particles have moved far: fastest where the crowd is smoothest, slowest at the spacing of neighbours."));
      if (!few) add("Why the strengths in the chart above can match their red line while these dots sit below this one: a strength needs no timing, but a rate needs the very first moment of fading, and even the shortest delays here give the crowd time to begin rearranging. Real particles would also push each other through the liquid around them (hydrodynamic interactions), which this simulation leaves out.");
      return;
    }
    add((cache.res.ref_rate ? "Dots: D(q) / D0 = \u0393(q) / \u0393ref(q), the rate of each pattern at the first delays against that of the same pattern in the dilute reference (bars: jackknife over ten parts of the movie); D0 = " : "Dots: D(q) = \u0393(q) / q\u00b2 from the first delays (bars: jackknife over ten parts of the movie), against D0 = ") + fmtSig(D0, 3) + " " + MU + "m\u00b2/s. Red: " + (x < 1 ? "D0 / [1 + x (S - 1)], with x = " + x + (few ? ", close to D0" : "") : "D0 / S(q)") + ", what the shortest delays should show without hydrodynamic interactions (this simulation has none).");
    if (few) add("With few particles dyed the dots follow self diffusion. They sit below D0 because the fit, down to f = 0.6, reaches delays where each particle already feels its cage.");
    else add("Why S(q) can match while D(q) sits below the red line: S(q) comes from the amplitudes, which do not depend on timing, but D(q) needs the initial slope of ln f, and the fit, down to f = 0.6, reaches delays where the cages are already felt. At the widest patterns each pattern of the image also takes in waves tilted along the axis of the microscope, where D0 / S is lower. Real colloids would also have hydrodynamic interactions, H(q) different from 1, which this simulation leaves out.");
  }

  // ---- result -------------------------------------------------------------------------------
  const MODE_SHORT = { brightfield: "bright-field", phase: "phase-contrast", darkfield: "dark-field", dic: "DIC", fluorescence: "widefield fluorescence", spinning: "spinning-disk confocal (X-Light V3)", scanning: "point-scanning confocal (AX R)" };
  function spotWidth() { return 0.61 * centralWavelength() / Math.min(objective().na, nLiquid(centralWavelength())); }
  // a peak worth the name: above 1.15 and at least 0.25 above the widest patterns measured, inside the q used
  function hasPeak(r) { const pr = r.rows[r.peak.k]; return r.peak.S > 1.15 && r.peak.S - r.S_low > 0.25 && r.peak.k > 1 && r.peak.k < r.rows.length - 1 && r.peak.S - 1 > 2 * ((pr && pr.S_err) || 0); }
  function kindOf(r) {
    if (cache.movie.truth.interact.label_fraction <= 0.1 || (cache.movie.truth.interact.label_fraction < 0.3 && !hasPeak(r))) return { word: "Single particles", text: "with few particles dyed the patterns follow single particles: S(q) stays near 1, and the decay gives how each one diffuses among its neighbours" };
    if (hasPeak(r)) return { word: "Neighbours " + fmtSig(2 * Math.PI / r.peak.q_per_um, 2) + " " + MU + "m apart", text: "the patterns are strongest at the spacing of neighbouring particles (2\u03c0 / q at the peak of S(q))" };
    const tp = truePeak();
    if (tp && tp.S > 1.15) return { word: "Peak not seen", text: "the simulated particles have a peak of S(q) = " + fmtSig(tp.S, 2) + " at q = " + fmtSig(tp.q_per_um, 2) + " " + MU + "m\u207b\u00b9, but this movie does not show it" };
    if (r.S_low < 0.85) return { word: "No clear peak", text: "the particles keep out of each other's way, so wide patterns are weaker than in a dilute sample (S = " + fmtSig(r.S_low, 2) + " at the widest), but no spacing of neighbours stands out within the patterns measured" };
    return { word: "No clear structure", text: "S(q) stays close to 1: the particles hardly arrange themselves at this volume fraction" };
  }
  function verdict() {
    const r = cache.res, tp = truePeak();
    if (!tp) return { cls: "info", text: "Nothing to compare" };
    if (!hasPeak(r)) {
      // no peak: the typical deviation over all the patterns used
      const d = r.rows.map(function (x) { const t = trueS(x.q_per_um); return t ? Math.abs(x.S / t - 1) : NaN; }).filter(isFinite).sort(function (a, b) { return a - b; });
      const off = d.length ? d[Math.floor(d.length / 2)] : 0;
      return off < 0.15 ? { cls: "good", text: "S(q) as in the simulation" } : { cls: "warn", text: "S(q) off by about " + Math.round(100 * off) + " %" };
    }
    const dh = Math.abs(r.peak.S / tp.S - 1), dq = Math.abs(r.peak.q_per_um / tp.q_per_um - 1);
    return dh < 0.1 && dq < 0.05 ? { cls: "good", text: "Peak as in the simulation (height within 10 %, place within 5 %)" } : dh < 0.25 && dq < 0.1 ? { cls: "warn", text: "Peak off by " + Math.round(100 * dh) + " % in height, " + Math.round(100 * dq) + " % in place" } : { cls: "bad", text: "Peak far from the simulation" };
  }
  function renderResult() {
    const res = cache.res, mv = cache.movie, tr = mv.truth.interact, v = verdict(), k = kindOf(res), tp = truePeak(), D0 = res.D0_um2_s;
    let h = '<div class="eyebrow">Result</div><div class="big">' + k.word + '</div><p class="small" style="margin:0">' + k.text + '.</p>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    const nums = [], low = res.rows[res.k_low] || res.rows[0];
    if (hasPeak(res)) nums.push("S(q) peaks at " + fmtSig(res.peak.S, 3) + " at q = " + fmtSig(res.peak.q_per_um, 3) + " " + MU + "m\u207b\u00b9" + (tp ? " (simulation " + fmtSig(tp.S, 3) + " at " + fmtSig(tp.q_per_um, 3) + ")" : ""));
    if (hasPeak(res) && res.peak.D_um2_s) nums.push("there the patterns fade " + fmtSig(D0 / res.peak.D_um2_s, 2) + " times more slowly than for one particle alone (expected about " + fmtSig(tp.S, 2) + " at the shortest delays)");
    nums.push("at the widest patterns (q = " + fmtSig(low.q_per_um, 2) + ") S = " + fmtSig(res.S_low, 2) + (res.D_low_um2_s ? " and D = " + fmtSig(res.D_low_um2_s / D0, 2) + " D0" : ""));
    h += '<p class="small" style="margin:0">' + nums.join("; ") + '.</p>';
    if (level !== "curious") {
      const row = function (cls, name, pq, ps, dp, sl, dl, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + pq + '</td><td>' + ps + '</td><td>' + dp + '</td><td>' + sl + '</td><td>' + dl + '</td></tr>'; };
      const f2 = function (x) { return x === null || x === undefined || !isFinite(x) ? "-" : fmtSig(x, 3); };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">Peak q (' + MU + 'm\u207b\u00b9)</th><th scope="col">S at the peak</th><th scope="col">D / D0 at the peak</th><th scope="col">S, widest</th><th scope="col">D / D0, widest</th></tr></thead><tbody>';
      const pk = hasPeak(res);
      t += row("main", "This page", pk ? f2(res.peak.q_per_um) : "-", pk ? f2(res.peak.S) : "-", pk && res.peak.D_um2_s ? f2(res.peak.D_um2_s / D0) : "-", f2(res.S_low), res.D_low_um2_s ? f2(res.D_low_um2_s / D0) : "-", "the headline");
      if (level === "addict" && res.published) {
        const pb = res.published;
        t += pb.failed ? row("pub", "Published method only", "-", "-", "-", "-", "-", "could not run: " + pb.failed) : row("pub", "Published method only", pb.has_peak ? f2(pb.peak_q_per_um) : "-", pb.has_peak ? f2(pb.peak_S) : "-", pb.has_peak && pb.peak_D_um2_s ? f2(pb.peak_D_um2_s / D0) : "-", f2(pb.S_low), pb.D_low_um2_s ? f2(pb.D_low_um2_s / D0) : "-", "the same movies: B from the first delays, the line through f = 1, D = \u0393 / q\u00b2, the reference bin by bin");
      }
      const sLowT = trueS(low.q_per_um);
      t += row("truth", "Simulation", pk && tp ? f2(tp.q_per_um) : "-", pk && tp ? f2(tp.S) : "-", pk && tp ? f2(1 / tp.S) + " (short times)" : "-", f2(sLowT), sLowT ? f2(1 / sLowT) + " (short times)" : "-", "");
      t += '</tbody></table></div>';
      h += t;
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Patterns used</dt><dd>q from ' + fmtSig(res.window.q_min_used, 2) + ' to ' + fmtSig(res.window.q_max_used, 2) + ' ' + MU + 'm\u207b\u00b9 (' + res.rows.length + ' q), where both this movie and the reference carry more signal than the camera noise</dd>';
      h += '<dt>Reference</dt><dd>a dilute movie of the same particles (volume fraction 4 %, ' + res.n_reference + ' particles), same optics and camera: the amplitude of one particle alone</dd>';
      h += '<dt>Rates</dt><dd>a straight line through ln f over the first delays, down to f = 0.6 (at least three delays)' + (res.offset ? ', with its own intercept' : ', through f = 1 at zero delay') + '; ' + (res.B_camera ? 'B = ' + fmtSig(res.B_camera, 3) + ' from the mean count and the read noise' : 'B at each q from the first delays') + '</dd>';
      h += '<dt>Simulation</dt><dd>Brownian dynamics, time step ' + fmtTime(tr.step_s) + ' (free steps of 3 % of the diameter, overlaps pushed apart), D0 = ' + fmtSig(tr.D0_um2_s, 3) + ' ' + MU + 'm\u00b2/s, Brownian time ' + fmtTime(tr.tau_B_s) + '; no hydrodynamic interactions; ' + tr.n_labelled + ' of ' + mv.info.n_particles + ' particles dyed</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h;
    $("hero-result").innerHTML = '<span>Volume fraction</span><span class="n">' + Math.round(100 * tr.phi) + ' %</span><span>Measured by DDM</span><span class="n">' + k.word.charAt(0).toLowerCase() + k.word.slice(1) + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie, " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg, tr = m.truth.interact;
    const modeTxt = { brightfield: "a bright-field microscope", phase: "a phase-contrast microscope", darkfield: "a dark-field microscope", dic: "a DIC microscope", fluorescence: "a widefield fluorescence microscope", spinning: "a spinning-disk confocal microscope", scanning: "a point-scanning confocal microscope" }[state.mode];
    $("movie-text").textContent = "The movie shows " + fmtSize(cfg.diameter_um) + " " + ({ ps: "polystyrene", pmma: "PMMA", silica: "silica" }[state.particle] || "") + " spheres filling " + Math.round(100 * tr.phi) + " % of the volume, " + (tr.kind === "hard" ? "which only touch" : "which repel each other before they touch") + ", filmed through " + modeTxt + (tr.label_fraction < 1 ? "; only " + tr.n_labelled + " of the " + m.info.n_particles + " are dyed and show" : "") + ". " + (tr.phi < 0.1 ? "Each particle wanders almost freely and meets a neighbour now and then. " : tr.phi < 0.3 ? "Each particle often bumps into its neighbours. " : "Each particle jiggles in a cage of neighbours and slowly escapes from it. ") + (state.mode === "spinning" || state.mode === "scanning" ? "The confocal pinholes keep only a thin layer in focus, so the crowd does not blur into a grey haze." : "Particles above and below the focus add a blurred haze.");
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + (m.times_s ? m.T + " frames at log-spaced times over " + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) + ", the closest " + fmtTime(1 / m.frame_rate_hz) + " apart" : m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s") + ". Box " + cfg.cell_um + " " + MU + "m deep, repeating in all directions, focus " + fmtSig(cfg.focus_um, 2) + " " + MU + "m from its bottom, " + m.info.n_particles + " particles.";
    $("diff-note").textContent = "A particle that moved leaves a pair of spots, one darker and one brighter. In a crowd the spots are packed so closely that the difference looks like fine speckle: DDM reads how the whole crowd rearranges, not single particles.";
    // step 6 follows the labelling: with few dyed, the charts show single particles among invisible neighbours
    const x = tr.label_fraction, few = x <= 0.1;
    $("sq-all-1").hidden = few; $("sq-all-2").hidden = few; $("sq-few-1").hidden = !few; $("sq-few-2").hidden = !few; $("curves-few").hidden = !few;
    $("sq-title").textContent = few ? "What the dyed particles show of the order: pairs are too rare" : x < 1 ? "How the particles arrange, as the dyed ones show it: the structure factor" : "How the particles arrange: the structure factor";
    $("dq-title").textContent = few ? "Motion of the dyed particles: their invisible neighbours still hold them back" : x < 1 ? "How fast each pattern starts to fade: collective and single-particle motion mixed" : "How fast each pattern starts to fade: collective diffusion";
    // the second movie the result depends on: the dilute reference
    const rc = CROWD.referenceConfig(cfg, tr.tau_B_s), rdt = 1 / rc.frame_rate_hz, rspan = rc.log_timing ? MOVIE.logTimes(rc.n_frames, rdt, rc.log_timing.factor)[rc.n_frames - 1] + rdt : rc.n_frames * rdt;
    $("movie-specs").innerHTML += " <b>Reference movie</b> (step 6 divides by it): the same particles, optics and camera, at 4 % and without interactions, " + rc.n_frames + " frames over about " + fmtDur(rspan) + ", long enough for its particles to wander through the depth of the box twice.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const r = cache.res, D0 = r.D0_um2_s;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: state.mode, detector: SCANNING() ? "Nikon AX R, " + SCANNERS[state.scanner].label : cam().label, simulation: cache.cfg, analysis: cache.opts,
      result: { peak_q_per_um: hasPeak(r) ? +r.peak.q_per_um.toPrecision(3) : null, peak_S: hasPeak(r) ? +r.peak.S.toPrecision(3) : null, D0_um2_s: +D0.toPrecision(3),
        q_per_um: r.rows.map(function (x) { return +x.q_per_um.toPrecision(3); }), S: r.rows.map(function (x) { return +x.S.toPrecision(3); }), D_over_D0: r.rows.map(function (x) { return x.D_um2_s ? +(x.D_um2_s / D0).toPrecision(3) : null; }) } };
    $("settings-json").textContent = JSON.stringify(obj, null, 1).replace(/\[\s+([-\d.e+,\s\[\]nul]+?)\s+\]/g, function (m, a) { return "[" + a.replace(/\s+/g, " ") + "]"; });
    focusableScrollers();
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + (res.pairs ? " (" + res.lags[li] + (res.lags[li] === 1 ? " frame interval, " : " frame intervals, ") + res.pairs[li].length / 2 + " pairs of frames)" : " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)")); $("lag").setAttribute("aria-valuetext", fmtDur(res.taus_s[li])); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawSq(); drawDq(); renderResult(); renderSettings();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const CARDS = [
    { lvl: 1, title: "From dilute to crowded", text: "At 5 % the particles rarely meet, yet the crowd already shows: S(q) is flat for fine patterns and about 0.7 for the widest ones, which fade about one and a half times faster than for one particle alone. At 30 % a peak grows at the spacing of neighbours, and the widest patterns weaken: a crowd resists being squeezed, so its density hardly varies over long distances. Compared with one particle alone, the patterns at the peak fade most slowly (de Gennes narrowing), because rearranging neighbours takes the longest, while the widest ones fade faster: the crowd pushes back. At 45 % the peak rises to about 2, and the patterns there fade about three times more slowly than for one particle alone (two expected at the shortest delays: the cages are felt within the delays used).",
      shows: [{ label: "5 %", set: { phi_c: 0.05 }, go: "step-rates" }, { label: "30 %", set: { phi_c: 0.3 }, go: "step-rates" }, { label: "45 %", set: { phi_c: 0.45 }, go: "step-rates" }] },
    { lvl: 1, title: "Charged spheres", text: "With little salt in the water, charged colloids repel each other before they touch, over a distance set by the salt (the Debye length). At the same volume fraction they avoid close contact and space themselves more evenly than hard spheres: the peak of S(q) grows and moves to wider patterns, and the widest patterns almost vanish.",
      shows: [{ label: "Hard spheres, 15 %", set: { phi_c: 0.15 }, go: "step-rates" }, { label: "Charged spheres, 15 %", set: { phi_c: 0.15, inter: "yukawa" }, go: "step-rates" }] },
    { lvl: 1, title: "Only a few dyed", text: "Dye one particle in twenty and the movie shows single particles among invisible neighbours. The peak of S(q) disappears, since pairs of dyed neighbours are rare, so the order hardly shows, and the patterns now follow each particle on its own (self diffusion). Its cage slows it down: over the delays used it diffuses at about 0.8 D0 at 30 %, and more slowly still at longer delays. With all particles dyed the widest patterns fade faster instead: two ways of looking at the same crowd.",
      shows: [{ label: "All dyed", set: {}, go: "step-rates" }, { label: "One in twenty", set: { label: 0.05 }, go: "step-rates" }] },
    { lvl: 2, title: "Confocal or widefield", text: "In a widefield microscope the particles above and below the focus add a blurred haze to every frame. It brings shot noise but almost no fine pattern, so the finest patterns sink into the noise sooner: in this thin chamber the range used shrinks, but still reaches past the peak of S(q). In thicker samples, or with smaller particles, whose peak lies at finer patterns, widefield loses the peak; the pinholes of a confocal remove the haze. At the widest patterns widefield even does a little better here: its thicker layer in focus mixes in fewer tilted patterns. That is why Lu et al. (2012) used confocal DDM for concentrated suspensions.",
      shows: [{ label: "Widefield fluorescence", set: { mode: "fluorescence" }, go: "step-rates" }, { label: "Spinning-disk confocal", set: {}, go: "step-rates" }] },
    { lvl: 2, title: "Hydrodynamic interactions", text: "Real particles in a liquid also push each other through the flow each one makes as it moves. This changes the collective rate to D0 q\u00b2 H(q) / S(q): for hard spheres the hydrodynamic function H(q) is below 1 at every q and follows the shape of S(q): highest near its peak, about 0.6 at 30 %, lower at wider and finer patterns (Segre, Behrend and Pusey 1995; Banchio and Nagele 2008). This simulation leaves the flow out (H = 1), so D(q) S(q) / D0 should come out as 1 at the shortest delays. It comes out lower, about 0.6-0.85 at 30 % and down to 0.35 at 45 %, because hard spheres bump into each other almost at once, so the fit reaches delays where the cages are already felt, and because the particles move in finite steps. Measuring H(q) is how DDM, like light scattering, sees hydrodynamics in real samples.",
      shows: [] }
  ];
  function buildCards() {
    const host = $("cards");
    CARDS.forEach(function (c) {
      const el = document.createElement("article"); el.className = "card" + (c.lvl === 2 ? " lvl-2" : c.lvl === 3 ? " lvl-3" : "");
      const h = document.createElement("h3"); h.textContent = c.title; el.appendChild(h);
      const p = document.createElement("p"); p.textContent = c.text; el.appendChild(p);
      if (c.shows.length) {
        const b = document.createElement("div"); b.className = "btns";
        c.shows.forEach(function (s) {
          const btn = document.createElement("button"); btn.type = "button"; btn.textContent = s.label;
          btn.addEventListener("click", function () { applyPreset(s.set); document.getElementById(s.go).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
          b.appendChild(btn);
        });
        el.appendChild(b);
      }
      host.appendChild(el);
    });
  }
  function applyPreset(set) {
    const keep = state.seed, sp = state.sim_px;
    compare = null; state = Object.assign({}, BASE, set); state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    prevMode = state.mode;
    resetPredictions();
    if (state.mode === "scanning" && !set.zoom) autoZoom();
    if (set.camera && !set.cam_mode) { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; }
    constrain(); syncControls(); drawFov(); schedule();
  }
  let predicting = false;
  const PREDICT_BASE = {
    crowd: function () { return state.label <= 0.1 ? { text: "This question needs all particles dyed, so that the order of the crowd shows.", set: {} } : state.phi_c >= 0.4 ? { text: "This question starts from a crowd below 40 %; the bench now has " + Math.round(100 * state.phi_c) + " %.", set: {} } : null; },
    dyed: function () { return TRANS() ? { text: "Only fluorescence and confocal microscopes show the dyed particles alone; the bench now uses transmitted light.", set: {} } : state.label <= 0.1 ? { text: "Few particles are dyed already: this question starts from a crowd with all of them dyed.", set: {} } : state.phi_c < 0.2 ? { text: "This question needs a crowd with a clear peak, at 20 % or more; the bench now has " + Math.round(100 * state.phi_c) + " %.", set: {} } : null; }
  };
  const PREDICT_VALUES = { phi: function () { return Math.round(100 * state.phi_c); } };
  // an exercise that does not fit the sample on the bench says so and offers to go back to its starting sample,
  // instead of describing a different experiment; numbers in an open question follow the bench
  function syncPredictionBases() {
    document.querySelectorAll(".predict").forEach(function (box) {
      const kind = box.getAttribute("data-predict"), f = PREDICT_BASE[kind], b = f ? f() : null, open = !box.classList.contains("answered");
      let el = box.querySelector(".base");
      if (!el && f) {
        el = document.createElement("div"); el.className = "base"; el.innerHTML = '<span></span> <button type="button">Go back to the standard sample</button>';
        box.insertBefore(el, box.querySelector(".btns"));
        el.querySelector("button").addEventListener("click", function () { const s = PREDICT_BASE[kind](); if (s) applyPreset(s.set); });
      }
      if (el) { el.hidden = !(b && open); if (b) el.querySelector("span").textContent = b.text; }
      if (open) {
        box.querySelectorAll("button[data-guess]").forEach(function (x) { x.disabled = !!b; });
        if (!b) box.querySelectorAll("[data-pv]").forEach(function (s) { const g = PREDICT_VALUES[s.getAttribute("data-pv")]; if (g) s.textContent = g(); });
      }
    });
  }
  function syncPredictions() { syncPredictionBases(); }
  function resetPredictions() {
    document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelector(".a").hidden = true; bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); });
  }
  function buildPredictions() {
    document.querySelectorAll(".predict").forEach(function (box) {
      box.querySelectorAll("button[data-guess]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (box.classList.contains("answered")) return;
          box.classList.add("answered");
          box.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = true; b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
          box.querySelector(".verdict").textContent = btn.getAttribute("data-guess") === box.getAttribute("data-right") ? "Well guessed." : "Not quite.";
          box.querySelector(".a").hidden = false; announce(box.querySelector(".a").textContent);
          const kind = box.getAttribute("data-predict");
          compare = null;
          if (kind === "dyed") { takeSnapshot(); state.label = 0.05; }
          if (kind === "crowd") { takeSnapshot(); state.phi_c = 0.45; }
          predicting = true; constrain(); syncControls(); predicting = false;
          if (compare && cache.res) { drawSq(); drawDq(); }   // say what is being computed
          schedule();
        });
      });
    });
  }

  // the numbers behind a chart, as a table (for screen readers, and for anyone who wants the values)
  function fillNumbers(id, head, rows) {
    const el = $(id); if (!el) return;
    const v = function (x) { return x === null || x === undefined || (typeof x === "number" && !isFinite(x)) ? "-" : typeof x === "number" ? fmtSig(x, 3) : x; };
    let h = '<div class="tscroll"><table class="sizing"><thead><tr>' + head.map(function (x) { return '<th scope="col">' + x + '</th>'; }).join("") + '</tr></thead><tbody>';
    rows.forEach(function (r) { h += '<tr>' + r.map(function (x, i) { return i === 0 ? '<th scope="row">' + v(x) + '</th>' : '<td>' + v(x) + '</td>'; }).join("") + '</tr>'; });
    el.querySelector("div").innerHTML = h + '</tbody></table></div>';
  }
  // exercise feedback, read out by screen readers
  function announce(t) {
    let el = $("sr-live");
    if (!el) { el = document.createElement("div"); el.id = "sr-live"; el.className = "sr-only"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.textContent = ""; setTimeout(function () { el.textContent = t; }, 50);
  }

  // code and equations wider than the page scroll sideways: they take the keyboard focus so they can be scrolled without a mouse
  function focusableScrollers() { document.querySelectorAll("pre, .eq").forEach(function (el) { if (el.scrollWidth > el.clientWidth + 1) { el.tabIndex = 0; if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.tagName === "PRE" ? "Code" : "Equation"); } else el.removeAttribute("tabindex"); }); }
  document.addEventListener("toggle", function () { focusableScrollers(); }, true);
  window.addEventListener("resize", function () { focusableScrollers(); });
  window.addEventListener("load", function () { focusableScrollers(); });
  // charts drawn on canvases are announced as pictures, with their description
  document.querySelectorAll("canvas[aria-label]").forEach(function (c) { if (!c.getAttribute("role")) c.setAttribute("role", "img"); });

  // ---- wiring -------------------------------------------------------------------------------
  buildControls(); buildCards(); buildPredictions();
  document.querySelectorAll('input[name="level"]').forEach(function (r) { r.addEventListener("change", function () { if (r.checked) setLevel(r.value, true); }); });
  document.querySelectorAll("[data-level-link]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); setLevel(a.getAttribute("data-level-link"), true); const first = document.querySelector(".step"); if (first) first.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0); }); });
  $("btn-reset").addEventListener("click", function () { compare = null; const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; document.querySelectorAll(".predict .a").forEach(function (a) { a.hidden = true; }); document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); }); constrain(); syncControls(); drawFov(); schedule(); });
  $("btn-seed").addEventListener("click", function () { state.seed = (state.seed * 1103515245 + 12345) % 2147483647; schedule(); });
  $("btn-play").addEventListener("click", function () { playing = !playing; $("btn-play").textContent = playing ? "Pause" : "Play"; });
  $("btn-play").textContent = playing ? "Pause" : "Play";
  $("lag").addEventListener("input", function () { if (!cache.res) return; renderLag(); drawDiff(frameIdx); drawMap(); });
  $("map-ov").addEventListener("click", onMapClick);
  document.querySelectorAll(".pn-more").forEach(function (b) { b.addEventListener("click", function () { b.closest(".proto-note").classList.add("open"); b.setAttribute("aria-expanded", "true"); }); }); $("pick-k").addEventListener("input", setPick); $("pick-a").addEventListener("input", setPick);
  $("btn-copy").addEventListener("click", function () {
    const txt = $("settings-json").textContent;
    const fallback = function () { const r = document.createRange(); r.selectNodeContents($("settings-json")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("btn-copy").textContent = "Selected, press copy"; };
    try { navigator.clipboard.writeText(txt).then(function () { $("btn-copy").textContent = "Copied"; }, fallback); } catch (e) { fallback(); }
  });
  let rz = null;
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawSq(); drawDq(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const PAGE_NAME = "crowded";
  // ---- sharing a setup and saving the movie ------------------------------------------------------------
  // the address holds the reader level and every setting that differs from the standard sample, e.g.
  // #student/diameter_um=0.5&mode=fluorescence (objectives by name, so a link survives changes to the list)
  function setupHash() {
    const q = [];
    Object.keys(BASE).forEach(function (k) {
      const v = state[k];
      if (JSON.stringify(v) === JSON.stringify(BASE[k])) return;
      q.push(encodeURIComponent(k) + "=" + encodeURIComponent(k === "objective" ? OBJECTIVES[v].n : v === null ? "null" : String(v)));
    });
    return "#" + level + (q.length ? "/" + q.join("&") : "");
  }
  // keys a shared link may set: the controls of the page, the q range and the seed (not the leftovers of the sizing page,
  // such as shape or polarizers, which this page keeps fixed)
  const HASH_KEYS = { seed: 1, q_min: 1, q_max: 1 }; CONTROLS.forEach(function (c) { if (c.key) HASH_KEYS[c.key] = 1; });
  function parseHash(h) {
    const parts = String(h || "").replace(/^#/, "").split("/"), set = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      const i = kv.indexOf("="); if (i < 1) return;
      let k, raw; try { k = decodeURIComponent(kv.slice(0, i)); raw = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (!Object.prototype.hasOwnProperty.call(BASE, k) || !(HASH_KEYS[k])) return;   // only settings the page shows
      if (k === "objective") { try { set[k] = objIndexByName(raw); } catch (e) { /* objective no longer listed: keep the standard one */ } return; }
      if (typeof BASE[k] === "number" || BASE[k] === null) { const x = raw === "null" ? null : parseFloat(raw); if (x === null || isFinite(x)) set[k] = x; return; }
      if (typeof BASE[k] === "string") set[k] = raw;
    });
    return { level: LEVEL_RANK[parts[0]] ? parts[0] : null, set: set };
  }
  function applySetup(p) {
    if (!Object.keys(p.set).length) return false;
    applyPreset(p.set);
    if (p.set.seed !== undefined) state.seed = p.set.seed;   // applyPreset keeps the seed only for researchers
    return true;
  }
  $("btn-share").addEventListener("click", function () {
    const h = setupHash(), url = location.href.split("#")[0] + h, msg = $("share-msg");
    try { history.replaceState(null, "", h); } catch (e) { /* sandboxed previews refuse it */ }
    const show = function (ok) { msg.textContent = ok ? "Link copied: it opens this page with these settings." : url; msg.style.wordBreak = ok ? "" : "break-all"; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { show(true); }, function () { show(false); });
    else show(false);
  });
  window.addEventListener("hashchange", function () {
    const p = parseHash(location.hash);
    if (p.level && p.level !== level) setLevel(p.level, false);
    applySetup(p);
  });
  // the movie as the page analyses it (photoelectrons per pixel), for ImageJ, Fiji or fastDDM
  function frameTimes() { return (cache.res && cache.res.times_s) || (cache.movie && cache.movie.times_s) || null; }
  function movieName() { const mv = cache.movie; return "ddm-" + PAGE_NAME + "-" + state.mode + "-" + mv.n + "x" + mv.n + "x" + mv.T; }
  $("btn-tiff").addEventListener("click", function () {
    const mv = cache.movie; if (!mv || !mv.frames) return;
    const note = "info=Simulated on rcerbino.github.io/ddm, photoelectrons per pixel" + (frameTimes() ? "; log-spaced frames, times in the CSV file" : "");
    DDM_TIFF.save(movieName() + ".tif", DDM_TIFF.tiff(mv.frames, mv.n, mv.T, mv.pixel_um, 1 / mv.frame_rate_hz, note), "image/tiff");
  });
  $("btn-times").addEventListener("click", function () {
    const t = frameTimes(); if (!t) return;
    let csv = "frame,time_s\n"; for (let i = 0; i < t.length; i++) csv += i + "," + (+t[i].toPrecision(9)) + "\n";
    DDM_TIFF.save(movieName() + "-times.csv", csv, "text/csv");
  });

  // start: the level and the settings in the address, if any (a shared link), else the standard sample
  const p0 = parseHash(location.hash);
  setLevel(p0.level || "curious", false);
  $("lag").value = 14;
  if (!applySetup(p0)) schedule();
  requestAnimationFrame(tick);
  // hook for automated checks of the page (reads settings, applies a preset; changes nothing by itself)
  window.DDM_PAGE = {
    preset: applyPreset, state: function () { return JSON.parse(JSON.stringify(state)); },
    controls: function () { return CONTROLS.filter(function (c) { return c.kind !== "qrange" && (!c.when || c.when()); }).map(function (c) {
      const opts = c.kind === "objective" ? OBJECTIVES.map(function (o, i) { return i; }) : c.kind === "select" ? (typeof c.options === "function" ? c.options() : c.options).map(function (o) { return o[0]; }) : null;
      return { key: c.key, kind: c.kind, lvl: c.lvl, min: c.min, max: c.max, options: opts };
    }); },
    truth: function () { return cache && cache.movie ? cache.movie.truth : null; },
    cfg: function () { return cache && cache.cfg ? JSON.parse(JSON.stringify(cache.cfg)) : null; },
    result: function () { const r = cache && cache.res; return r ? { kind: kindOf(r).word, verdict: verdict().text, peak: r.peak, truePeak: truePeak(), S_low: r.S_low, D_low_over_D0: r.D_low_um2_s / r.D0_um2_s, rows: r.rows.map(function (x) { return { q: x.q_per_um, S: x.S, S_true: trueS(x.q_per_um), D_over_D0: x.D_um2_s / r.D0_um2_s }; }), published: r.published || null } : null; }
  };
})();
