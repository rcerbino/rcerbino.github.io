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

  // The materials: a solvent (the liquid set below) plus Maxwell modes [G (Pa), tau (s)] and an equilibrium modulus G_inf
  // (a solid when > 0); see visco.js. The tracer beads feel them through the generalised Stokes-Einstein relation.
  //   Concentrated wormlike micelles: CPyCl/NaSal/NaCl 100/60/33 mM at 25 C, one Maxwell mode tau = 0.64 s, eta_0 = 25.7 Pa s
  //   and high-frequency viscosity 0.039 Pa s (Lennon, Geri, McKinley and Swan, J. Rheol. 64, 1263, 2020), so G_0 = 40 Pa; the
  //   viscosity above the solvent's is a mode with tau = 10 us.
  //   Critical gel (Winter and Chambon, J. Rheol. 30, 367, 1986): G(t) = S t^-n, here n = 1/2, modes 2 per decade.
  //   The soft micelles, the polymer solution and the gels have values chosen for the page, soft enough for DDM.
  const VE = {
    newtonian: { label: "A simple liquid: the solvent alone", short: "a simple liquid", modes: function () { return []; } },
    micelles: { label: "Wormlike micelles: one relaxation time (Maxwell fluid)", short: "a solution of wormlike micelles", modes: function () { return [[0.5, 0.5]]; } },
    polymer: { label: "Polymer solution: many relaxation times (Rouse model)", short: "a polymer solution", modes: function () { return VISCO.rouseModes(0.1, 0.5, 30); } },
    pregel: { label: "Gelling sample, before the gel point", short: "a sample just before it gels", modes: function () { return VISCO.powerLawModes(0.05, 0.5, 1e-4, 1); } },
    critical: { label: "Gelling sample, at the gel point (critical gel)", short: "a sample at its gel point", modes: function () { return VISCO.powerLawModes(0.05, 0.5, 1e-4, 1e4); } },
    gel: { label: "Gelling sample, after the gel point: a soft gel", short: "a soft gel", Ginf: 0.05, modes: function () { return VISCO.powerLawModes(0.05, 0.5, 1e-4, 1e4); } },
    stiff: { label: "Concentrated wormlike micelles (CPyCl/NaSal/NaCl, Lennon et al. 2020)", short: "concentrated wormlike micelles", modes: function () { return [[40.1, 0.64], [3800, 1e-5]]; } },
    custom: { label: "Your own: one relaxation time and a plateau", short: "a material of your own", custom: true }
  };
  function materialSpec() {
    const m = VE[state.mat];
    if (m.custom) return { G_inf_Pa: state.mat_Ginf, modes: state.mat_G > 0 ? [[state.mat_G, state.mat_tau]] : [] };
    return { G_inf_Pa: m.Ginf || 0, modes: m.modes() };
  }
  const KB = 1.380649e-23;
  // Stokes-Einstein diffusion coefficient of the beads in the solvent alone (um^2/s)
  function dSE() { return KB * (state.T_C + 273.15) / (3 * Math.PI * viscosity_mPa_s() * 1e-3 * state.diameter_um * 1e-6) * 1e12; }
  function solventPa_s() { return viscosity_mPa_s() * 1e-3; }
  function fmtPa(v) { return !isFinite(v) ? "-" : v >= 0.1 ? fmtSig(v, 2) + " Pa" : fmtSig(v * 1000, 2) + " mPa"; }
  function fmtPas(v) { return !isFinite(v) ? "-" : v >= 0.1 ? fmtSig(v, 2) + " Pa s" : fmtSig(v * 1000, 2) + " mPa s"; }
  function fmtW(w) { return fmtSig(w, 2) + " rad/s"; }
  // what the material is, in numbers: zero-shear viscosity, crossing of G' and G'', plateau
  function materialFacts() {
    const mat = materialSpec(), es = solventPa_s();
    return { eta0: VISCO.eta0(mat, es), cross: VISCO.crossings(mat, es, 1e-3, 1e5), Ginf: mat.G_inf_Pa || 0 };
  }
  function materialHint() {
    const f = materialFacts(), parts = [];
    if (f.Ginf > 0) parts.push("A solid: an elastic plateau of " + fmtPa(f.Ginf) + " at low frequency, so the beads stay in their cages.");
    else parts.push("Flows at long times, with a viscosity of " + fmtPas(f.eta0) + " (the solvent: " + fmtPas(solventPa_s()) + ").");
    const c = f.cross.filter(function (x) { return x.elastic_above; })[0];
    if (c && level !== "curious") parts.push("G' and G'' cross at " + fmtW(c.w) + ": more elastic above, more viscous below.");
    if (state.mat === "critical" || state.mat === "pregel" || state.mat === "gel") parts.push(level === "curious" ? "As a gel forms, its relaxation times stretch out until, at the gel point, they have no end." : "Power law G(t) = S t^-1/2 (Winter and Chambon), S = 0.05 Pa s^1/2" + (state.mat === "pregel" ? ", cut off at 1 s: still a liquid." : state.mat === "gel" ? ", plus a plateau of 0.05 Pa: a solid." : " from 0.1 ms to about 3 hours: neither liquid nor solid within any movie."));
    if (state.mat === "stiff") parts.push("Measured with a rheometer by Lennon et al. (2020): relaxation time 0.64 s, plateau 40 Pa. Stiff for DDM: the beads hardly move.");
    return parts.join(" ");
  }
  // how far the beads get: the plateau of a solid, kT / (pi a G) in 3D, as a share of the widest pattern the analysis uses
  function cageHint() {
    const a = state.diameter_um / 2 * 1e-6, f = materialFacts(), kT = KB * (state.T_C + 273.15);
    if (!(f.Ginf > 0)) return "";
    const r = Math.sqrt(kT / (Math.PI * a * f.Ginf) * 2 / 3) * 1e6;   // rms displacement in the image plane, um
    return "In this gel two looks at a bead, far apart in time, find it on average about " + fmtSig(r * 1000, 2) + " nm apart in the image plane.";
  }
  // the standard sample: 500 nm polystyrene tracer beads (as the LB5 latex of Edera et al. 2017) in a soft solution of
  // wormlike micelles, bright field through a 40x objective, 512 log-spaced frames from 2 ms to about 100 s
  const BASE = {
    mode: "brightfield", particle: "ps", n_custom: 1.59, diameter_um: 0.5, size_spread: 0, size_dist: "schulz", phi: 2e-3,
    liquid: "water", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 20, focus_frac: 0.5, optics: "auto",
    mat: "micelles", mat_G: 0.5, mat_tau: 0.5, mat_Ginf: 0,
    objective: objIndexByName("CFI Plan Fluor 40X"), condenser: "elwd", na_c: 0.3, source: "green",
    dye: "green", rate_ph_ms: 200, bg_e_ms: 2, light_frac: 0.5,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 1, roi: 256, sim_px: 128, n_frames: 512,
    annulus: "Ph2", ring_T: 0.25, df_kind: "dry", df_light_e: 1e7, stray_frac: 1e-4, dic_shear_um: 0.24, dic_bias_deg: 90, dic_angle_deg: 45,
    scanner: "resonant", scan_px: 512, zoom: 1, line_avg: 2, pinhole_au: 1, scan_rate: 2e7,
    frame_rate_hz: 500, exposure_ms: 0.2, frame_timing: "log", log_factor: 100,
    shape: "sphere", aspect: 3, dn: 0.1, dn_body: 0, polarizer: "off", analyzer: "off", pol_angle_deg: 90, extinction: 1e-4,
    windowing: "off", q_min: null, q_max: null, seed: 1, rho_custom: 1.05, rho_liquid: 1.0,
    x_amp: "on", x_noise: "on", x_depth: "on", x_spectrum: "on"
  };
  let state = Object.assign({}, BASE);
  const LEVEL_RANK = { curious: 1, student: 2, researcher: 3, addict: 4 };
  let level = "curious";

  function fmtSize(um) { return um < 1 ? Math.round(um * 1000) + " nm" : um.toFixed(um < 2 ? 2 : 1) + " " + MU + "m"; }
  function fmtNum(v) { return v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function fmtSig(v, d) { if (!Number.isFinite(v)) return "-"; if (v === 0) return "0"; const p = Math.pow(10, d - 1 - Math.floor(Math.log10(Math.abs(v)))); return (Math.round(v * p) / p).toString(); }
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
  const MAX_PARTICLES = 30000, MAX_POINTS = 60000;
  let phiCapped = false, phiRaised = false;
  function particlesFor(n) { return state.phi / geometry().volume * Math.pow(n * pixelUm(), 2) * state.cell_um; }
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
    while (n > 32 && (particlesFor(n) > MAX_PARTICLES || particlesFor(n) * ppp > MAX_POINTS)) n /= 2;
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
    }, { visco: materialSpec(), drift_um_s: 0, drift_deg: 0, gravity: false, walls: false });
  }
  function analysisOptions() {
    return { radius_um: state.diameter_um / 2, q_min_per_um: state.q_min, q_max_per_um: state.q_max, windowing: state.windowing === "on",
      // what this page adds to the plain method, each switchable at the "Addict" level, where the plain method also runs on
      // the same movie for comparison
      amplitude: state.x_amp === "off" ? "variance" : undefined, noise: state.x_noise === "off" ? "fit" : undefined, depth: state.x_depth !== "off",
      inversion: state.x_spectrum === "off" ? "mason" : "spectrum", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const BODY = function () { return state.shape === "prolate" || state.shape === "oblate" || state.shape === "rod"; };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "particle", group: "Sample", lvl: 2, label: "Material of the beads", kind: "select", options: function () { return SHAPE_MATERIALS.sphere.map(function (k) { return [k, MATERIALS[k]]; }); } },
    { key: "n_custom", group: "Sample", lvl: 1, label: "Particle refractive index", kind: "lin", min: 1.3, max: 2.6, step: 0.01, fmt: function (v) { return v.toFixed(2); }, when: function () { return state.particle === "custom"; } },
    { key: "diameter_um", group: "Sample", lvl: 1, label: "Diameter of the beads", kind: "log", min: 0.1, max: 3, fmt: fmtSize, hint: function () { return (level === "curious" ? "Smaller beads move further, but show less. " : "In the solvent alone they would diffuse with D = " + fmtSig(dSE(), 3) + " " + MU + "m\u00b2/s. ") + cageHint(); } },
    { key: "phi", group: "Sample", lvl: 2, label: "Concentration of beads (volume fraction)", kind: "log", min: 1e-6, max: 1e-2, fmt: fmtPhi, hint: function () { return particleCount() + " particles in the simulated volume." + (phiCapped ? " Lowered to fit what the browser can follow (" + MAX_PARTICLES + " particles even in the smallest simulated field)." : "") + (phiRaised ? " Raised so that a few particles are in the simulated field." : ""); } },
    { key: "liquid", group: "Sample", lvl: 2, label: "Solvent", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", group: "Sample", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; }, hint: function () { return "Viscosity " + fmtPas(solventPa_s()) + " at " + Math.round(state.T_C) + " " + DEG + "C."; } },
    { key: "n_liquid", group: "Sample", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", group: "Sample", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", group: "Sample", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", group: "Sample", lvl: 2, label: "Chamber thickness", kind: "log", min: 1, max: 100, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return particleCount() > 30000 ? "Too many particles for the browser (" + particleCount() + "): lower the concentration or simulate a smaller part of the image." : state.mode === "dic" && state.cell_um >= 200 ? "DIC is simulated in cells up to 200 " + MU + "m." : state.cell_um > 60 ? "Thick cells take longer to simulate (up to about 20 s): far from focus each particle's image changes with depth in many ways." : ""; } },
    { key: "focus_frac", group: "Sample", lvl: 2, label: "Focus height in the chamber", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },

    // the material the beads sit in
    { key: "mat", group: "Sample", lvl: 1, label: "Material", kind: "select", options: Object.keys(VE).map(function (k) { return [k, VE[k].label]; }), hint: materialHint },
    { key: "mat_G", group: "Sample", lvl: 2, label: "Modulus of the relaxation, G", kind: "log", min: 0.01, max: 100, fmt: fmtPa, when: function () { return state.mat === "custom"; } },
    { key: "mat_tau", group: "Sample", lvl: 2, label: "Relaxation time", kind: "log", min: 0.001, max: 100, fmt: function (v) { return fmtTime(v); }, when: function () { return state.mat === "custom"; } },
    { key: "mat_Ginf", group: "Sample", lvl: 2, label: "Plateau: elastic modulus at rest (0 for a liquid)", kind: "lin", min: 0, max: 5, step: 0.05, fmt: fmtPa, when: function () { return state.mat === "custom"; }, hint: cageHint },

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
    { key: "df_light_e", group: "Microscope (Nikon Ti2-E)", lvl: 2, label: "Lamp power (electrons per pixel if all the light reached the camera)", kind: "log", min: 1e4, max: 1e10, fmt: function (v) { return fmtPhi(v); }, when: function () { return state.mode === "darkfield" || (TRANS() && state.mode !== "dic" && state.analyzer === "on"); }, hint: function () { return state.mode === "darkfield" ? "" : "With an analyzer the lamp is turned up to fill the camera, up to this limit."; } },
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
      options: function () { return [10, 20, 50, 100, 200].map(function (k) { return [k, k + " times (" + fmtDur(movieSpanS(k)) + ")"]; }); } },
    { key: "sim_px", group: "Camera and recording", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]] },

    { key: "windowing", group: "Analysis", lvl: 2, label: "Windowing (Giavazzi et al. 2017)", kind: "select", options: [["off", "Off"], ["on", "On: each frame multiplied by a window that falls to zero at the edges"]],
      hint: function () { return state.windowing === "on" ? "Cells or particles that cross the edge of the image no longer leave bands along the axes of the map in step 4, nor a fast decay that swamps the finest patterns. The price: the window darkens the edges, so less of the field counts and the results scatter more, and patterns wider than a fifth of the field are left out (the window mixes each pattern with its neighbours)." : "The Fourier transform treats the image as one tile of a repeating pattern, so cells or particles crossing the edges make jumps at the tile borders. The central cross of the map is left out to remove most of their effect."; } },
    { key: "qrange", group: "Analysis", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // where each control sits: the imaging mode, then everything about the sample, the light reaching it, and how the
  // "Addict": the additions to the published method, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_amp", lvl: 4, label: "Amplitude A from the mean power", kind: "select", options: ONOFF("A = 2 var - B, from the variance in time"),
      hint: function () { return "On: A = 2 <|F(q)|\u00b2> - B, the whole amplitude, including the part of each pattern that the beads do not renew within the movie (all of it in a solid, much of it for the widest patterns of a slowly flowing liquid). Off: A = 2 var - B, the usual estimate, which misses that part."; } },
    { key: "x_noise", lvl: 4, label: "Camera noise known from the detector", kind: "select", options: ONOFF("B at each q from the first delays"),
      hint: function () { return "On: B = 2 (excess-noise factor x mean count + read noise\u00b2), the same at every q. Off: B at each q from a quadratic through the first five delays."; } },
    { key: "x_depth", lvl: 4, label: "Depth of field", kind: "select", options: ONOFF("only sideways motion"),
      hint: function () { return "On: beads that move up or down also change each pattern, through the optics of step 1, as on the sizing page. Off: f = exp(-q\u00b2 <\u0394r\u00b2> / 4)."; } },
    { key: "x_spectrum", lvl: 4, label: "Moduli from a fitted retardation spectrum", kind: "select", options: ONOFF("Mason's local power-law formulas"),
      hint: function () { return "On: the compliance J(t) fitted with springs and dashpots side by side (all with positive weights), whose moduli follow exactly. Off: G' and G'' from the local slope of <\u0394r\u00b2>, as in Mason (2000)."; } }
  );

  // light is collected and recorded. Every control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Sample", [
      ["Tracer beads", ["particle", "n_custom", "diameter_um", "phi", "dye"]],
      ["The material", ["mat", "mat_G", "mat_tau", "mat_Ginf"]],
      ["Solvent and temperature", ["liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "T_C"]],
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
      ["Addict: what this page adds", ["x_amp", "x_noise", "x_depth", "x_spectrum"]]]]
  ];
  // one-line summary under each block title: [setting, text before, text after]
  const SUMMARY = {
    "Sample": [["mat"], ["diameter_um", "beads of "], ["liquid", "in "], ["T_C"]],
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
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, windowing: 1, x_amp: 1, x_noise: 1, x_depth: 1, x_spectrum: 1 };
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
        wrap.innerHTML = '<div class="row"><label for="' + id + '"></label><output for="' + id + '"></output></div><input type="range" id="' + id + '">';
        wrap.querySelector("label").textContent = typeof c.label === "function" ? c.label() : c.label;
        const inp = wrap.querySelector("input"), out = wrap.querySelector("output");
        if (c.kind === "log") { inp.min = 0; inp.max = 1000; inp.step = 1; } else { inp.min = c.min; inp.max = c.max; inp.step = c.step; }
        const read = function () { return c.kind === "log" ? c.min * Math.pow(c.max / c.min, inp.value / 1000) : parseFloat(inp.value); };
        inp.addEventListener("input", function () { out.textContent = c.fmt(read()); inp.setAttribute("aria-valuetext", out.textContent); });
        inp.addEventListener("change", function () { state[c.key] = read(); onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, set: function (v) { inp.value = c.kind === "log" ? 1000 * Math.log(v / c.min) / Math.log(c.max / c.min) : v; out.textContent = c.fmt(v); inp.setAttribute("aria-valuetext", out.textContent); } };
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
        sel.addEventListener("change", function () { state[c.key] = (c.num || c.kind === "objective") ? parseInt(sel.value, 10) : sel.value; onChange(c.key); });
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
    if (phiCapped) state.phi *= 0.95 / over;
    // and raised when the simulated field would hold fewer than 3 particles (large particles at low concentration)
    const nNow = particlesFor(simPx());
    phiRaised = !phiCapped && nNow < 3 && state.phi < 1e-2;
    if (phiRaised) state.phi = Math.min(1e-2, state.phi * 5 / Math.max(nNow, 1e-9));
  }
  // zoom that samples the confocal spot at about Nyquist (pixel near lambda / 4 NA)
  function autoZoom() {
    const target = DYES[state.dye].em / (4 * Math.min(objective().na, 1.33));
    const opts = [1, 2, 4, 8, 16, 32];
    state.zoom = opts.filter(function (z) { return FIELD_NUMBER_MM * 1000 / Math.SQRT2 / objective().m / z / state.scan_px <= target * 1.5; })[0] || 32;
  }
  let lastKey = null, lastMat = BASE.mat;
  function onChange(key) {
    lastKey = key;
    // switching to phase contrast with an objective that has no phase ring: take the phase objective of the same
    // magnification with the closest NA (Plan Fluor 20X -> Plan Fluor DLL 20X Ph1), so phase contrast is really on
    if (key === "mode" && state.mode === "phase" && !objRing()) {
      const o0 = objective(); let best = -1, bd = Infinity;
      OBJECTIVES.forEach(function (o, i) { if (!o.ph || o.m !== o0.m) return; const k = o.ph.replace(/^Ext\s*/i, "").replace(/^PH/i, "Ph"); if (!ANNULI[k]) return; const dd = Math.abs(o.na - o0.na) + (o.n.split(" ")[1] === o0.n.split(" ")[1] ? 0 : 0.05); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) state.objective = best;
    }
    if ((key === "mode" || key === "objective") && state.mode === "phase" && objRing()) state.annulus = objRing();
    // your own material starts from the one on show
    if (key === "mat" && state.mat === "custom") { const m = lastMat ? VE[lastMat] : null; if (m && !m.custom) { const md = m.modes(); state.mat_G = md.length ? Math.round(md[0][0] * 100) / 100 : 0.5; state.mat_tau = md.length ? md[0][1] : 0.5; state.mat_Ginf = m.Ginf || 0; } }
    if (key === "mat") lastMat = state.mat;
    if (SCANNING() && (key === "mode" || key === "objective" || key === "scan_px")) autoZoom();
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
    return ["optics-src", "visco-src", "movie-src", "engine-src", "rheo-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
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
  function showError(msg) { const el = $("error"); el.hidden = false; el.textContent = "The run stopped: " + msg; $("status").textContent = "The run stopped: see the message under the settings."; $("bar").style.width = "0"; idle(); }
  let inflight = null;
  let runStart = 0;
  function start(kind) {
    runStart = performance.now();
    if (kind === "analyse" && inflight === "simulate") kind = "simulate";   // the worker's movie would not match the page's
    const token = ++runToken;
    inflight = kind;
    $("error").hidden = true;
    const cfg = simConfig(), opts = analysisOptions();
    if (kind === "simulate" && worker) { worker.terminate(); worker = null; }
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
  function drive(gen, token, a, b) {
    return new Promise(function (resolve) {
      function step() {
        if (token !== runToken) { resolve(null); return; }
        const t0 = performance.now(); let r;
        try { do { r = gen.next(); if (!r.done) progress(a + (b - a) * r.value.frac, r.value.stage); } while (!r.done && performance.now() - t0 < 30); }
        catch (e) { showError(e.message); resolve(null); return; }
        if (r.done) resolve(r.value); else setTimeout(step, 0);
      }
      step();
    });
  }
  async function runHere(kind, token, cfg, opts) {
    let movie = cache.movie;
    if (kind === "simulate" || !movie) { movie = await drive(MOVIE.simulate(cfg), token, 0, 0.85); if (!movie) return; }
    const res = await drive(RHEO.analyse(movie, opts), token, 0.85, opts.compare_published ? 0.93 : 1);
    if (!res) return;
    if (opts.compare_published) { let rp = null; try { rp = await drive(RHEO.analyse(movie, Object.assign({}, opts, { published_only: true })), token, 0.93, 1); } catch (e) { rp = null; } res.published = rp ? RHEO.publishedSummary(rp) : { failed: "too little to work with" }; }
    inflight = null;
    finish(movie, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  function finish(movie, res, cfg, opts) {
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    // a new movie: the delay slider in the middle of the delays where the beads moved measurably, and the lower map zoomed on
    // the patterns used
    if (fresh) {
      // the delay at which the patterns in the middle of the q used are half renewed (else the middle of the delays measured)
      const qm = res.q_per_um[res.bins[Math.floor(res.bins.length / 2)]], target = 4 * Math.LN2 / (qm * qm), sm = res.smooth;
      let tw = Math.sqrt(res.window.t_lo_s * res.window.t_hi_s);
      for (let i = 1; i < sm.t_s.length; i++) if (sm.m_um2[i - 1] < target && sm.m_um2[i] >= target) { tw = sm.t_s[i]; break; }
      const ta = res.taus_s;
      let li = 0; for (let k = 0; k < ta.length; k++) if (Math.abs(Math.log(ta[k] / tw)) < Math.abs(Math.log(ta[li] / tw))) li = k;
      $("lag").max = ta.length - 1; $("lag").value = li;
      cache.zoomK = Math.max(8, Math.min(movie.n / 2 - 1, Math.round(res.window.q_max_used * movie.L_um / (2 * Math.PI)) + 2));
    }
    $("btn-times").hidden = !frameTimes();
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames of " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " particles."; idle();
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
    if (simPx() < outPx()) txt += " Your browser simulates the central " + simPx() + " x " + simPx() + " pixels; the full image would reach down to q = " + fmtSig(qloROI, 2) + " " + MU + "m<sup>-1</sup> instead of " + fmtSig(qloSim, 2) + ".";
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
    $("zoom-note").textContent = "The centre of the map above, lightly smoothed (grey: the cross along the axes, left out because the edges of the image add artefacts there), q up to " + fmtSig(qz, 2) + " " + MU + "m\u207b\u00b9 (stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m), at the same delay.";
  }
  function drawMapOverlay() {
    const ov = $("map-ov"), n = cache.movie.n, S = ov.width, s = S / n;
    const ctx = ov.getContext("2d"); ctx.clearRect(0, 0, S, S);
    const cx = S / 2 + 0.5 * s, cy = S / 2 + 0.5 * s;
    const kopt = cache.res.window.q_opt_per_um * cache.movie.L_um / (2 * Math.PI);
    ctx.lineWidth = 2;
    if (level !== "curious" && kopt < n / 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, kopt * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
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
    // the delay at which the beads have moved enough to renew half of this pattern: q^2 <dr^2> / 4 = ln 2
    const sm = cache.res.smooth, target = 4 * Math.LN2 / (q * q);
    let th = null; for (let i = 1; i < sm.t_s.length; i++) if (sm.m_um2[i - 1] < target && sm.m_um2[i] >= target) { const f = Math.log(target / sm.m_um2[i - 1]) / Math.log(sm.m_um2[i] / sm.m_um2[i - 1]); th = sm.t_s[i - 1] * Math.pow(sm.t_s[i] / sm.t_s[i - 1], f); break; }
    txt += th ? ". The beads renew half of it in about <b>" + fmtTime(th) + "</b>" : sm.m_um2[sm.m_um2.length - 1] < target ? ". Within the movie the beads never move far enough to renew half of it" : ". The beads renew half of it faster than the shortest delay";
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
  // the smooth mean squared displacement at time t (log-log interpolation; null outside the range measured)
  function msdAt(t) {
    const sm = cache.res.smooth, ts = sm.t_s; if (t < ts[0] || t > ts[ts.length - 1]) return null;
    let i = 1; while (i < ts.length - 1 && ts[i] < t) i++;
    const f = Math.log(t / ts[i - 1]) / Math.log(ts[i] / ts[i - 1]);
    return Math.exp(Math.log(sm.m_um2[i - 1]) + f * (Math.log(sm.m_um2[i]) - Math.log(sm.m_um2[i - 1])));
  }
  // the true mean squared displacement in the image plane, from the simulated material
  function trueMsd(t) { const v = cache.movie.truth.visco; return v ? 2 * VISCO.msd1({ lam: v.lam, c: v.c }, t) : null; }
  // five of the q used: how much of each pattern is left, with the line that the measured displacement implies
  function drawCurves() {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    const a = axes($("chart-curves"), { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.15, y1: 1.15, xlabel: "Delay (s)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    const nb = res.bins.length, pick = []; for (let i = 0; i < Math.min(5, nb); i++) pick.push(Math.round(i * (nb - 1) / Math.max(1, Math.min(5, nb) - 1)));
    pick.forEach(function (k) {
      const b = res.bins[k], q = res.q_per_um[b], col = qColor(qPos(q));
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); let on = false;
      for (let i = 0; i <= 160; i++) { const t = x0 * Math.pow(x1 / x0, i / 160), m = msdAt(t); if (m === null) { on = false; continue; } const X = a.fx(t), Y = a.fy(Math.exp(-q * q * m / 4)); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); }
      ctx.stroke();
      res.f[k].forEach(function (f, li) { if (isFinite(f)) dot(ctx, a.fx(taus[li]), a.fy(Math.max(-0.15, Math.min(1.15, f))), 2.4, col, null); });
    });
    a.done();
    const leg = $("curves-legend"); leg.innerHTML = "";
    pick.forEach(function (k) { const q = res.q_per_um[res.bins[k]], s = document.createElement("span"); s.innerHTML = '<i style="background:' + qColor(qPos(q)) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / q, 2) + " " + MU + "m" : "q = " + q.toFixed(2) + " " + MU + "m\u207b\u00b9"); leg.appendChild(s); });
  }
  // mean squared displacement: from each q (coloured), combined (black, with its uncertainty), and the truth
  function drawMsd() {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25, m = res.msd;
    const vals = []; res.msd_q.forEach(function (r) { r.forEach(function (v) { if (v > 0) vals.push(v); }); });
    taus.forEach(function (t) { const v = trueMsd(t); if (v > 0) vals.push(v); });
    const y0 = Math.min.apply(null, vals) / 2, y1 = Math.max.apply(null, vals) * 2;
    const a = axes($("chart-msd"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1, xlabel: "Delay (s)", ylabel: level === "curious" ? "How far the beads get (" + MU + "m\u00b2)" : "<\u0394r\u00b2> in the image plane (" + MU + "m\u00b2)" }), ctx = a.ctx;
    // the truth (dashed) and slopes 1 and 0 as guides at the Student level
    if (level !== "curious") { ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.setLineDash([7, 4]); ctx.beginPath(); for (let i = 0; i <= 160; i++) { const t = x0 * Math.pow(x1 / x0, i / 160), v = trueMsd(t), X = a.fx(t), Y = a.fy(v); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); ctx.setLineDash([]); }
    res.msd_q.forEach(function (r, k) { const col = qColor(qPos(res.q_per_um[res.bins[k]])); ctx.globalAlpha = 0.55; r.forEach(function (v, li) { if (v > 0) dot(ctx, a.fx(taus[li]), a.fy(v), 1.8, col, null); }); });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); res.smooth.t_s.forEach(function (t, i) { const X = a.fx(t), Y = a.fy(res.smooth.m_um2[i]); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.stroke();
    m.m_um2.forEach(function (v, li) {
      if (!(v > 0)) return; const X = a.fx(taus[li]), e = m.err_ln[li];
      if (e) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(X, a.fy(v * Math.exp(-e))); ctx.lineTo(X, a.fy(v * Math.exp(e))); ctx.stroke(); }
      dot(ctx, X, a.fy(v), 2.8, C.ink, null);
    });
    a.done();
    const ul = $("msd-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    add(level === "curious" ? "Coloured dots: from each stripe spacing alone, in the colours of step 5. Black: all of them together, with the curve through them." : "Coloured dots: the displacement that gives the measured f at each q alone (colours of step 5; with the depth of field, see the math), where f is clearly below 1 and above 0.15. Black: combined over q, with its uncertainty (jackknife over ten parts of the movie), and the smooth curve used below.");
    if (level !== "curious") add("Dashed red: what the simulated beads do in this material (exact). A slope of 1 on these axes is free diffusion; a flat stretch, beads held in cages.");
  }
  // storage (G') and loss (G'') moduli against frequency, with the rheometer (the material simulated)
  function drawModuli() {
    const res = cache.res, ws = res.w_rad_s, x0 = ws[0] / 1.5, x1 = ws[ws.length - 1] * 1.5, mat = materialSpec(), es = cache.movie.viscosity_Pa_s;
    const vals = [];
    ws.forEach(function (w, k) { [res.Gp_Pa[k], res.Gpp_Pa[k]].forEach(function (v) { if (v > 0) vals.push(v); }); const g = VISCO.gstar(mat, es, w); if (g[0] > 0) vals.push(g[0]); if (g[1] > 0) vals.push(g[1]); });
    vals.sort(function (p, q) { return p - q; });
    const top = vals[vals.length - 1] * 2, bottom = Math.max(vals[0] / 2, top * 1e-5);
    const a = axes($("chart-moduli"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: bottom, y1: top, xlabel: "Angular frequency \u03c9 (rad/s)", ylabel: "G' and G'' (Pa)" }), ctx = a.ctx;
    const line = function (f, col, dash, wd) { ctx.strokeStyle = col; ctx.lineWidth = wd || 1.5; ctx.setLineDash(dash); ctx.beginPath(); let on = false; for (let i = 0; i <= 160; i++) { const w = x0 * Math.pow(x1 / x0, i / 160), v = f(w); if (!(v > 0)) { on = false; continue; } const X = a.fx(w), Y = a.fy(Math.max(bottom / 10, v)); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); } ctx.stroke(); ctx.setLineDash([]); };
    line(function (w) { return VISCO.gstar(mat, es, w)[0]; }, C.accent, [7, 4]);
    line(function (w) { return VISCO.gstar(mat, es, w)[1]; }, C["accent-2"], [7, 4]);
    if (LEVEL_RANK[level] >= 3) {
      const mw = function (arr) { return function (w) { let k = 0; while (k < ws.length - 1 && ws[k + 1] < w) k++; return w < ws[0] || w > ws[ws.length - 1] ? NaN : arr[k]; }; };
      ctx.globalAlpha = 0.6; line(mw(res.mason.Gp_Pa), C.accent, [2, 3], 1.2); line(mw(res.mason.Gpp_Pa), C["accent-2"], [2, 3], 1.2); ctx.globalAlpha = 1;
    }
    ws.forEach(function (w, k) {
      const X = a.fx(w);
      [[res.Gp_Pa[k], res.Gp_err_ln[k], C.accent, "dot"], [res.Gpp_Pa[k], res.Gpp_err_ln[k], C["accent-2"], "sq"]].forEach(function (p) {
        if (!(p[0] > 0)) return; const Y = a.fy(Math.max(bottom, p[0]));
        if (p[1] > 0) { ctx.strokeStyle = p[2]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(Math.max(bottom, p[0] * Math.exp(-p[1])))); ctx.lineTo(X, a.fy(Math.min(top, p[0] * Math.exp(p[1])))); ctx.stroke(); }
        if (p[3] === "dot") dot(ctx, X, Y, 3.2, p[2], null); else { ctx.strokeStyle = p[2]; ctx.lineWidth = 1.6; ctx.strokeRect(X - 3, Y - 3, 6, 6); }
      });
    });
    a.done();
    const ul = $("mod-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    add(level === "curious" ? "Blue dots: how elastic the material is (G', the storage modulus). Red squares: how viscous (G'', the loss modulus). Dashed lines: what a rheometer would measure on the material simulated." : "Blue dots: G', red squares: G'', from the beads (bars: jackknife over ten parts of the movie). Dashed: the moduli of the material simulated, as a rheometer would give them. A modulus less than a tenth of the other is left out of the comparison in the result: no method resolves it next to the larger one.");
    if (LEVEL_RANK[level] >= 3) add("Dotted: Mason's local power-law formulas on the same mean squared displacement.");
  }

  // ---- result -------------------------------------------------------------------------------
  const MODE_SHORT = { brightfield: "bright-field", phase: "phase-contrast", darkfield: "dark-field", dic: "DIC", fluorescence: "widefield fluorescence", spinning: "spinning-disk confocal (X-Light V3)", scanning: "point-scanning confocal (AX R)" };
  function spotWidth() { return 0.61 * centralWavelength() / Math.min(objective().na, nLiquid(centralWavelength())); }
  function pctTxt(x) { return x === null || x === undefined || !isFinite(x) ? "-" : (100 * x < 1 ? "<1" : Math.round(100 * x)) + " %"; }
  // how far a set of moduli is from the material's: mean |ln ratio| over the frequencies measured, counting each modulus
  // where it is at least a tenth of the larger one (a modulus far below the other is beyond what any method resolves)
  let offUsed = [0, 0];      // how many G' and G'' values the last comparison counted
  function offFromTruth(ws, gp, gpp) {
    const mat = materialSpec(), es = cache.movie.viscosity_Pa_s; let s = 0, n = 0; offUsed = [0, 0];
    ws.forEach(function (w, k) { const g = VISCO.gstar(mat, es, w), mx = Math.max(g[0], g[1]); [[gp[k], g[0]], [gpp[k], g[1]]].forEach(function (p, j) { if (p[1] >= 0.1 * mx && p[0] > 0) { s += Math.abs(Math.log(p[0] / p[1])); n++; offUsed[j]++; } }); });
    return n ? s / n : null;
  }
  // G' and G'' nearly equal over the range (a gel point): crossings there are only noise
  function parallelOf(ws, gp, gpp) { const d = ws.map(function (w, k) { return Math.abs(Math.log(gp[k] / gpp[k])); }).filter(isFinite).sort(function (a, b) { return a - b; }); return d.length > 4 && d[Math.floor(d.length * 0.75)] < 0.35; }
  function trueParallel(ws) { const mat = materialSpec(), es = cache.movie.viscosity_Pa_s, g = ws.map(function (w) { return VISCO.gstar(mat, es, w); }); return parallelOf(ws, g.map(function (x) { return x[0]; }), g.map(function (x) { return x[1]; })); }
  function crossingsOf(ws, gp, gpp) {
    const out = []; for (let k = 1; k < ws.length; k++) { const d0 = Math.log(gp[k - 1] / gpp[k - 1]), d1 = Math.log(gp[k] / gpp[k]); if (isFinite(d0) && isFinite(d1) && (d0 > 0) !== (d1 > 0)) out.push({ w: ws[k - 1] * Math.pow(ws[k] / ws[k - 1], d0 / (d0 - d1)), elastic_above: d1 > 0 }); }
    return out;
  }
  // what the beads say about the material, in a few words
  function kindOf(r) {
    if (r.plateau_Pa) return { word: "A solid", text: "at long times the beads stay in their cages: G' levels off" };
    if (r.eta_long_Pa_s) return { word: "A liquid", text: "at long times the beads diffuse freely: the material flows" };
    return { word: "In between", text: "the beads neither diffuse freely nor stay put within the movie" };
  }
  // the verdict names the window it covers, and which modulus it could compare when one is too small to resolve
  function verdict() {
    const r = cache.res, off = offFromTruth(r.w_rad_s, r.Gp_Pa, r.Gpp_Pa), ws = r.w_rad_s;
    if (off === null) return { cls: "info", text: "No moduli to compare" };
    const win = " from " + fmtSig(ws[0], 2) + " to " + fmtSig(ws[ws.length - 1], 2) + " rad/s", only = !offUsed[0] ? ", G'' only (G' too small there)" : !offUsed[1] ? ", G' only (G'' too small there)" : "";
    return off < 0.2 ? { cls: only ? "info" : "good", text: "Matches the rheometer" + win + only } : off < 0.5 ? { cls: "warn", text: "Off from the rheometer by about " + Math.round(100 * (Math.exp(off) - 1)) + " %" + win + only } : { cls: "bad", text: "Far from the rheometer (a factor " + fmtSig(Math.exp(off), 2) + " on average)" + win + only };
  }
  function renderResult() {
    const res = cache.res, mv = cache.movie, v = verdict(), k = kindOf(res), facts = materialFacts();
    const crossEl = res.crossings.filter(function (c) { return c.elastic_above; });
    let h = '<div class="eyebrow">Result</div><div class="big">' + k.word + '</div><p class="small" style="margin:0">' + k.text + '.</p>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    const nums = [];
    const par = parallelOf(res.w_rad_s, res.Gp_Pa, res.Gpp_Pa);
    if (par) nums.push("G' and G'' run side by side, nearly equal at every frequency measured: the signature of a gel point");
    else if (crossEl.length) nums.push("G' and G'' cross at " + fmtW(crossEl[0].w) + " (a relaxation time of about " + fmtTime(1 / crossEl[0].w) + "): more elastic at higher frequencies, more viscous at lower ones");
    if (res.eta_long_Pa_s) nums.push("viscosity at long times " + fmtPas(res.eta_long_Pa_s) + " (true " + fmtPas(facts.eta0) + ")");
    // the plateau is 1 / J at the end of the movie; the truth the same, from the exact displacement there
    const tEnd = res.window.t_hi_s, mTrue = trueMsd(tEnd), pTrue = mTrue > 0 ? KB * (mv.T_C + 273.15) / (Math.PI * res.radius_um * 1e-6 * 1.5 * mTrue * 1e-12) : null;
    if (res.plateau_Pa) nums.push("elastic plateau " + fmtPa(res.plateau_Pa) + " at " + fmtDur(tEnd) + (pTrue ? " (true " + fmtPa(pTrue) + (facts.Ginf > 0 && Math.abs(pTrue / facts.Ginf - 1) > 0.05 ? ", still relaxing towards " + fmtPa(facts.Ginf) : "") + ")" : ""));
    nums.push("measured from " + fmtW(res.w_rad_s[0]) + " to " + fmtW(res.w_rad_s[res.w_rad_s.length - 1]));
    h += '<p class="small" style="margin:0">' + nums.join("; ") + '.</p>';
    if (res.plateau_Pa || res.alpha_end < 0.35) h += '<p class="small" style="margin:0">' + (level === "curious" ? "In a solid the beads keep the same places for the whole movie, so one field of view is one sample of the material: from one field to the next the result can change by 5-10 %. Real measurements average a few fields of view." : "A solid holds its beads in one arrangement for the whole movie, so this field of view is a single sample of it: the frozen speckle of the beads' resting places makes the displacement, and the moduli, differ by 5-10 % from one field to the next in our tests (six fields of the soft gel), more than the uncertainty shown, which comes from parts of the same movie. Average a few fields of view (New random sample, at the Researcher level, shows another).") + '</p>';
    if (level !== "curious") {
      const row = function (cls, name, cross, eta, plat, off, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + cross + '</td><td>' + eta + '</td><td>' + plat + '</td><td>' + off + '</td></tr>'; };
      const crossTxt = function (cs, ws, gp, gpp) { if (ws && parallelOf(ws, gp, gpp)) return "side by side"; const c = cs.filter(function (x) { return x.elastic_above; }); return c.length ? fmtW(c[0].w) : "none"; };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">G\' = G\'\'</th><th scope="col">Viscosity</th><th scope="col">Plateau</th><th scope="col">Off from the rheometer</th></tr></thead><tbody>';
      const offTxt = function (o) { return o === null ? "-" : o > Math.log(2) ? "a factor " + fmtSig(Math.exp(o), 2) : Math.round(100 * (Math.exp(o) - 1)) + " %"; };
      t += row("main", res.inversion === "mason" ? "Mason's formulas" : "Retardation spectrum", crossTxt(res.crossings, res.w_rad_s, res.Gp_Pa, res.Gpp_Pa), res.eta_long_Pa_s ? fmtPas(res.eta_long_Pa_s) : "-", res.plateau_Pa ? fmtPa(res.plateau_Pa) : "-", offTxt(offFromTruth(res.w_rad_s, res.Gp_Pa, res.Gpp_Pa)), "the headline");
      if (LEVEL_RANK[level] >= 3 && res.inversion !== "mason") t += row("", "Mason's formulas, same displacement", crossTxt(crossingsOf(res.w_rad_s, res.mason.Gp_Pa, res.mason.Gpp_Pa), res.w_rad_s, res.mason.Gp_Pa, res.mason.Gpp_Pa), "-", "-", offTxt(offFromTruth(res.w_rad_s, res.mason.Gp_Pa, res.mason.Gpp_Pa)), "G* from the local slope of <\u0394r\u00b2> (Mason 2000)");
      if (level === "addict" && res.published) {
        const pb = res.published;
        t += pb.failed ? row("pub", "Plain method", "-", "-", "-", "-", "could not run: " + pb.failed) : row("pub", "Plain method", crossTxt(pb.crossings, pb.w_rad_s, pb.Gp_Pa, pb.Gpp_Pa), pb.eta_long_Pa_s ? fmtPas(pb.eta_long_Pa_s) : "-", pb.plateau_Pa ? fmtPa(pb.plateau_Pa) : "-", offTxt(offFromTruth(pb.w_rad_s, pb.Gp_Pa, pb.Gpp_Pa)), "the same movie: A = 2 var - B, B from the first delays, no depth of field, q where <\u0394r\u00b2> < 1/q\u00b2, Mason's formulas");
      }
      const tc = facts.cross.filter(function (x) { return x.elastic_above && x.w >= res.w_rad_s[0] / 3 && x.w <= res.w_rad_s[res.w_rad_s.length - 1] * 3; });
      const tauMax = materialSpec().modes.reduce(function (m, md) { return Math.max(m, md[1]); }, 0);
      t += row("truth", "True (the material simulated)", trueParallel(res.w_rad_s) ? "side by side" : tc.length ? fmtW(tc[0].w) : "none here", facts.Ginf > 0 ? "none (a solid)" : tauMax > 30 * res.window.t_hi_s ? "not reached (relaxes over " + fmtDur(tauMax) + ")" : fmtPas(facts.eta0), facts.Ginf > 0 ? fmtPa(facts.Ginf) : "-", "", "");
      t += '</tbody></table></div>';
      h += t;
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Patterns used</dt><dd>q from ' + fmtSig(res.window.q_min_used, 2) + ' to ' + fmtSig(res.window.q_max_used, 2) + ' ' + MU + 'm\u207b\u00b9 (' + res.bins.length + ' q); at each delay those where f is clearly below 1 and above 0.15, at least three</dd>';
      h += '<dt>Delays and displacements</dt><dd>' + fmtTime(res.window.t_lo_s) + ' to ' + fmtDur(res.window.t_hi_s) + '; &lang;&Delta;r&sup2;&rang; from ' + fmtSig(res.window.msd_lo_um2, 2) + ' to ' + fmtSig(res.window.msd_hi_um2, 2) + ' ' + MU + 'm&sup2; (the smallest a bead moved, the largest)</dd>';
      h += '<dt>Amplitude and noise</dt><dd>' + (state.x_amp === "off" ? "A = 2 var - B" : "A = 2 &lang;|F|&sup2;&rang; - B (the mean power)") + '; ' + (res.B_camera ? 'B = ' + fmtSig(res.B_camera, 3) + ' from the mean count and the read noise, the same at every q' : 'B at each q from the first delays') + '</dd>';
      h += '<dt>Beads</dt><dd>radius ' + fmtSize(res.radius_um) + ' (from the settings, as for real tracers of known size); depth of field ' + (res.depth ? 'included' : 'left out') + '</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h;
    $("hero-result").innerHTML = '<span>Material</span><span class="n">' + VE[state.mat].short + '</span><span>Measured by DDM</span><span class="n">' + k.word.toLowerCase() + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie, " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  function visibilityText(cfg) {
    const w = spotWidth(), d = cfg.diameter_um;
    if (d >= w) return "The beads are larger than the smallest detail the microscope resolves, so you see each one as a small disc or ring.";
    return "Each bead is smaller than the smallest detail the microscope resolves (about " + fmtSig(w, 2) + " " + MU + "m here), so it shows as a blurred spot of about that width.";
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg;
    const modeTxt = { brightfield: "a bright-field microscope", phase: "a phase-contrast microscope", darkfield: "a dark-field microscope", dic: "a DIC microscope", fluorescence: "a widefield fluorescence microscope", spinning: "a spinning-disk confocal microscope", scanning: "a point-scanning confocal microscope" }[state.mode];
    $("movie-text").textContent = "The movie shows " + fmtSize(cfg.diameter_um) + " " + MATERIALS[state.particle].toLowerCase().replace(" (set the index)", "") + " beads in " + VE[state.mat].short + ", filmed through " + modeTxt + ". The beads jiggle, kicked by the molecules around them, but the material holds them back: how far they get, and how that grows with time, tells how elastic and how viscous it is. The material itself is invisible; only the beads show. " + visibilityText(cfg);
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + (m.times_s ? m.T + " frames at log-spaced times over " + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) + ", the closest " + fmtTime(1 / m.frame_rate_hz) + " apart" : m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s") + ". Chamber " + cfg.cell_um + " " + MU + "m thick, focus " + fmtSig(cfg.focus_um, 2) + " " + MU + "m above the bottom, " + m.info.n_particles + " beads.";
    $("diff-note").textContent = "A bead that moved leaves a pair of spots, one darker and one brighter, at its old and its new place. In a gel the pairs stay faint at every delay: the beads cannot get far.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const r = cache.res;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: state.mode, detector: SCANNING() ? "Nikon AX R, " + SCANNERS[state.scanner].label : cam().label, simulation: cache.cfg, analysis: cache.opts,
      result: { kind: kindOf(r).word, crossings_rad_s: r.crossings.map(function (c) { return +c.w.toPrecision(3); }), eta_long_Pa_s: r.eta_long_Pa_s ? +r.eta_long_Pa_s.toPrecision(3) : null, plateau_Pa: r.plateau_Pa ? +r.plateau_Pa.toPrecision(3) : null,
        w_rad_s: r.w_rad_s.map(function (w) { return +w.toPrecision(3); }), G_storage_Pa: r.Gp_Pa.map(function (g) { return +g.toPrecision(3); }), G_loss_Pa: r.Gpp_Pa.map(function (g) { return +g.toPrecision(3); }) } };
    obj.simulation = Object.assign({}, cache.cfg, { visco: { material: state.mat, G_inf_Pa: cache.cfg.visco.G_inf_Pa, modes: cache.cfg.visco.modes.map(function (m) { return [+m[0].toPrecision(3), +m[1].toPrecision(3)]; }) } });
    $("settings-json").textContent = JSON.stringify(obj, null, 1).replace(/\[\s+([-\d.e+,\s\[\]]+?)\s+\]/g, function (m, a) { return "[" + a.replace(/\s+/g, " ") + "]"; });
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + (res.pairs ? " (" + res.lags[li] + (res.lags[li] === 1 ? " frame interval, " : " frame intervals, ") + res.pairs[li].length / 2 + " pairs of frames)" : " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)")); $("lag").setAttribute("aria-valuetext", fmtDur(res.taus_s[li])); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawMsd(); drawModuli(); renderResult(); renderSettings();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const CARDS = [
    { lvl: 1, title: "A liquid, a solid, and in between", text: "In water the beads diffuse freely: the mean squared displacement grows in proportion to time and only G'' shows, growing with frequency. In a solution of wormlike micelles they first rattle in a cage, then escape once the micelles relax: elastic at high frequencies, viscous at low ones, with G' and G'' crossing in between. In a soft gel they never escape: the displacement levels off and G' keeps a plateau down to the lowest frequencies.",
      shows: [{ label: "Water", set: { mat: "newtonian", log_factor: 10 }, go: "step-rates" }, { label: "Wormlike micelles", set: { mat: "micelles" }, go: "step-rates" }, { label: "Soft gel", set: { mat: "gel" }, go: "step-rates" }] },
    { lvl: 1, title: "Watching a gel form", text: "As a sample gels, its slowest relaxation gets slower and slower. Just before the gel point it still flows at long times. At the gel point the relaxation times have no end: G' and G'' are parallel lines, equal at every frequency (both grow as the square root of frequency here), and the beads' mean squared displacement grows as the square root of time over the whole movie. Past it a plateau appears: a solid, still very soft.",
      shows: [{ label: "Before", set: { mat: "pregel" }, go: "step-rates" }, { label: "At the gel point", set: { mat: "critical" }, go: "step-rates" }, { label: "After", set: { mat: "gel" }, go: "step-rates" }] },
    { lvl: 1, title: "Too stiff for these beads", text: "Concentrated wormlike micelles (Lennon et al. 2020) have a plateau of 40 Pa: in it a 500 nm bead rattles by only about 10 nm, far below what these patterns can see. DDM sees nothing until a few seconds, when the micelles let the beads flow: it gets the viscosity, but not the elastic part. Beads of 200 nm move further and open the window a little earlier (up to about 0.7 rad/s), still short of where G' and G'' cross (1.6 rad/s). Rheometers, or light scattering through the whole sample (DWS), reach stiffer materials.",
      shows: [{ label: "500 nm beads", set: { mat: "stiff" }, go: "step-rates" }, { label: "200 nm beads", set: { mat: "stiff", diameter_um: 0.2 }, go: "step-rates" }] },
    { lvl: 2, title: "The size of the beads", text: "In the same material, beads half as large have twice the mean squared displacement in the same time (they get about 1.4 times as far), which suits DDM, but they show less, and the signal can sink into the camera noise. The moduli do not change: they belong to the material. In real samples the beads must also be larger than the mesh of the material, or they slip through it and feel the solvent instead.",
      shows: [{ label: "200 nm", set: { diameter_um: 0.2 }, go: "step-rates" }, { label: "1 " + MU + "m", set: { diameter_um: 1 }, go: "step-rates" }] },
    { lvl: 2, title: "Fast and slow in one movie", text: "Microrheology wants many decades of frequency: frames close together for the fast relaxations and a long movie for the slow ones. Evenly spaced, 512 frames at 500 per second last one second and miss everything slower. Log-spaced frames, in repeating cycles like a multi-tau correlator, stretch the same frames over about 100 s. Edera et al. (2017) recorded two movies instead, at 777 and 10 frames per second.",
      shows: [{ label: "Evenly spaced", set: { frame_timing: "even" }, go: "step-rates" }, { label: "Log-spaced, 100 times longer", set: {}, go: "step-rates" }] },
    { lvl: 2, title: "Dim light", text: "With the lamp at 0.2 % the camera noise is as large as the signal of the finest stripes. Here that costs little: the noise is known from the photon count and averages out over the movie, so the displacement and the moduli barely change, only their scatter grows. In real movies, noise that is not known as well (dust, vibration, a flickering lamp) hurts more.",
      shows: [{ label: "Lamp at 0.2 %", set: { light_frac: 0.002 }, go: "step-rates" }] },
    { lvl: 3, title: "Why the mean power", text: "The usual estimate of the amplitude, A = 2 var - B, uses how much each pattern changes during the movie. It is right only for patterns the beads renew completely within the movie. In a solid part of every pattern never changes; in a slowly flowing liquid the widest patterns are only partly renewed by the end. In both cases the variance misses part of A: the displacements come out too large, the moduli too small. The mean power of each pattern holds the whole amplitude. At the Addict level the switch \"Amplitude A from the mean power\", and the \"Plain method\" row of the result, show the difference.",
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
    state = Object.assign({}, BASE, set); state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    lastMat = state.mat;
    resetPredictions();
    if (state.mode === "scanning" && !set.zoom) autoZoom();
    if (set.camera && !set.cam_mode) { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; }
    constrain(); syncControls(); drawFov(); schedule();
  }
  let predicting = false;
  function syncPredictions() { /* both questions apply to any material */ }
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
          box.querySelector(".a").hidden = false;
          const kind = box.getAttribute("data-predict");
          if (kind === "gel") { state.mat = "gel"; lastMat = "gel"; }
          if (kind === "bigger") state.diameter_um = Math.min(3, 2 * state.diameter_um);
          predicting = true; constrain(); syncControls(); predicting = false; schedule();
        });
      });
    });
  }

  // ---- wiring -------------------------------------------------------------------------------
  buildControls(); buildCards(); buildPredictions();
  document.querySelectorAll('input[name="level"]').forEach(function (r) { r.addEventListener("change", function () { if (r.checked) setLevel(r.value, true); }); });
  document.querySelectorAll("[data-level-link]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); setLevel(a.getAttribute("data-level-link"), true); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }); });
  $("btn-reset").addEventListener("click", function () { const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; document.querySelectorAll(".predict .a").forEach(function (a) { a.hidden = true; }); document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); }); constrain(); syncControls(); drawFov(); schedule(); });
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
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawMsd(); drawModuli(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const PAGE_NAME = "rheology";
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
    let csv = "frame,time_s\n"; for (let i = 0; i < t.length; i++) csv += i + "," + t[i] + "\n";
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
    result: function () { const r = cache && cache.res; return r ? { kind: kindOf(r).word, off: offFromTruth(r.w_rad_s, r.Gp_Pa, r.Gpp_Pa), crossings: r.crossings, eta: r.eta_long_Pa_s, plateau: r.plateau_Pa, published: r.published || null } : null; }
  };
})();
