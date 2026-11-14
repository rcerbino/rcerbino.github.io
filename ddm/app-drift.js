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
  const SHAPES = { sphere: "Spheres", bisphere: "Birefringent spheres", prolate: "Prolate ellipsoids (cigars)", oblate: "Oblate ellipsoids (discs)", rod: "Rods (cylinders)" };
  // materials that make sense for each shape; the first is the default when the shape is chosen
  const SHAPE_MATERIALS = { sphere: ["ps", "pmma", "silica", "custom"], bisphere: ["rm257", "mfa", "custom"], prolate: ["ps", "pmma", "silica", "custom"], oblate: ["ps", "pmma", "silica", "custom"], rod: ["bacterium", "silica", "ps", "custom"] };
  const SIZE_LABEL = { sphere: "Diameter", bisphere: "Diameter", prolate: "Length (long axis)", oblate: "Diameter of the disc", rod: "Length" };
  const ASPECT_LABEL = { prolate: "Aspect ratio (long axis / short axis)", oblate: "Aspect ratio (diameter / thickness)", rod: "Aspect ratio (length / diameter)" };
  const LIQUIDS = { water: "Water", glycerol: "Water + glycerol", custom: "Other (set index and viscosity)" };
  const FIELD_NUMBER_MM = 25;          // Ti2 field of view (F-mount port); also the X-Light V3 and AX scan fields

  function objIndexByName(name) { for (let i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].n === name) return i; throw new Error("objective not found: " + name); }

  // Thermophoresis of colloids: measured Soret coefficients S_T = D_T / D (1/K). D_T = S_T x D, with D from
  // Stokes-Einstein at the temperature set; drift v = -D_T grad T (towards the cold side when D_T > 0).
  //   Duhr and Braun, Phys. Rev. Lett. 96, 168301 (2006): 200 nm polystyrene in 1 mM Tris, S_T = 0.7 /K (D_T = 1.4 um^2/(s K)).
  //   Braibanti, Vigolo and Piazza, Phys. Rev. Lett. 100, 108303 (2008), Fig. 2: polystyrene of radius 253, 123 and 53 nm
  //   (1:1 H2O/D2O), S_T read from the figure (about +-0.1 /K) and joined by straight lines.
  //   Iacopini, Rusconi and Piazza, Eur. Phys. J. E 19, 59 (2006): polystyrene of radius 30 nm in 4 mM NaCl,
  //   S_T = S_inf [1 - exp((T* - T) / T0)] with S_inf = 0.92 /K, T* = 278.3 K, T0 = 19 K.
  const THERMO = {
    duhr200: { label: "200 nm polystyrene (Duhr and Braun 2006)", d: 0.2, ST: function () { return 0.7; }, range: null },
    br253: { label: "506 nm polystyrene (Braibanti, Vigolo and Piazza 2008)", d: 0.506, pts: [[5, -1.4], [15, 0.4], [25, 1.65], [35, 2.2]] },
    br123: { label: "246 nm polystyrene (Braibanti, Vigolo and Piazza 2008)", d: 0.246, pts: [[5, -0.65], [15, 0.25], [25, 0.8], [35, 1.2], [45, 1.5]] },
    br53: { label: "106 nm polystyrene (Braibanti, Vigolo and Piazza 2008)", d: 0.106, pts: [[5, -0.25], [15, 0.2], [25, 0.4], [35, 0.55], [45, 0.7]] },
    iac30: { label: "60 nm polystyrene (Iacopini, Rusconi and Piazza 2006)", d: 0.06, ST: function (T) { return 0.92 * (1 - Math.exp((278.3 - (T + 273.15)) / 19)); }, range: [3, 45] },
    custom: { label: "Other (set the Soret coefficient)", d: null }
  };
  function thermoST() {
    const s = THERMO[state.thermo_sys];
    if (state.thermo_sys === "custom") return state.st_custom;
    if (s.ST) return s.ST(state.T_C);
    const p = s.pts, T = Math.max(p[0][0], Math.min(p[p.length - 1][0], state.T_C));
    for (let i = 0; i < p.length - 1; i++) if (T <= p[i + 1][0]) return p[i][1] + (p[i + 1][1] - p[i][1]) * (T - p[i][0]) / (p[i + 1][0] - p[i][0]);
    return p[p.length - 1][1];
  }
  function thermoRange() { const s = THERMO[state.thermo_sys]; return s.pts ? [s.pts[0][0], s.pts[s.pts.length - 1][0]] : s.range || null; }
  const G = 9.81, KB = 1.380649e-23;
  // Stokes-Einstein diffusion coefficient of the spheres set (um^2/s)
  function dSE() { return KB * (state.T_C + 273.15) / (3 * Math.PI * viscosity_mPa_s() * 1e-3 * state.diameter_um * 1e-6) * 1e12; }
  function thermoDT() { return thermoST() * dSE(); }
  function particleDensity() { return state.particle === "custom" ? state.rho_custom : OPTICS.particleDensity(state.particle); }
  function liquidDensity() { return OPTICS.liquidDensity(liquidSpec(), state.T_C); }
  // Stokes settling speed (um/s), positive when the particles sink
  function stokesV() { const a = state.diameter_um / 2 * 1e-6; return 2 / 9 * (particleDensity() - liquidDensity()) * 1000 * G * a * a / (viscosity_mPa_s() * 1e-3) * 1e6; }
  // the drift the particles should show: in the image plane (plane true) with its speed and direction, or along the axis
  function expectedDrift() {
    if (state.cause === "flow") {
      const f = state.flow_profile === "poiseuille" ? 6 * state.focus_frac * (1 - state.focus_frac) : 1;
      // Poiseuille: the microscope averages over its depth of field, so it sees a speed between the one at the focus and the mean
      return state.flow_profile === "poiseuille" ? { plane: true, speed: state.flow_v * f, deg: state.flow_deg, lo: Math.min(1, f) * state.flow_v, hi: Math.max(1, f) * state.flow_v } : { plane: true, speed: state.flow_v, deg: state.flow_deg };
    }
    if (state.cause === "sediment") { const v = stokesV(); return state.orient === "side" ? { plane: true, speed: Math.abs(v), deg: v >= 0 ? 90 : 270 } : { plane: false, speed: Math.abs(v), deg: null }; }
    if (state.cause === "thermo") { const v = thermoDT() * state.grad; return state.grad_dir === "plane" ? { plane: true, speed: Math.abs(v), deg: v >= 0 ? 180 : 0 } : { plane: false, speed: Math.abs(v), deg: null }; }
    return { plane: true, speed: 0, deg: 0 };
  }
  // the standard sample: 1 um polystyrene beads in water carried by a flow of 10 um/s to the right, 10x / 0.3,
  // ELWD condenser fully open, green filter. Spheres only: the particles are colloids that do not interact.
  const BASE = {
    mode: "brightfield", particle: "ps", n_custom: 1.59, diameter_um: 1, size_spread: 0, size_dist: "schulz", phi: 3e-3,
    liquid: "water", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 20, focus_frac: 0.5, rho_custom: 1.05, rho_liquid: 1.0, optics: "auto",
    cause: "flow", flow_v: 10, flow_deg: 0, flow_profile: "plug", orient: "upright", thermo_sys: "duhr200", st_custom: 1, grad: 0.05, grad_dir: "plane",
    objective: objIndexByName("CFI Plan Fluor 10X"), condenser: "elwd", na_c: 0.3, source: "green",
    dye: "green", rate_ph_ms: 200, bg_e_ms: 2, light_frac: 0.5,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 1, roi: 512, sim_px: 128, n_frames: 256,
    annulus: "Ph2", ring_T: 0.25, df_kind: "dry", df_light_e: 1e7, stray_frac: 1e-4, dic_shear_um: 0.24, dic_bias_deg: 90, dic_angle_deg: 45,
    scanner: "resonant", scan_px: 512, zoom: 1, line_avg: 2, pinhole_au: 1, scan_rate: 2e7,
    frame_rate_hz: 20, exposure_ms: 1, frame_timing: "even", log_factor: 20,
    shape: "sphere", aspect: 3, dn: 0.1, dn_body: 0, polarizer: "off", analyzer: "off", pol_angle_deg: 90, extinction: 1e-4,
    windowing: "off", q_min: null, q_max: null, seed: 2,
    x_noise: "on", x_phase: "on"
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
  function hydro() { return OPTICS.hydrodynamics(geometry(), 1.380649e-23 * (state.T_C + 273.15), viscosity_mPa_s() * 1e-3); }
  function polarization() {
    const P = state.polarizer === "on", A = state.analyzer === "on";
    if (!TRANS() || state.mode === "dic" || (!P && !A)) return null;
    // with unpolarized light the analyzer's direction does not matter; with a polarizer it sits at the chosen angle from it
    return { polarizer_deg: P ? 0 : null, analyzer_deg: A ? (P ? state.pol_angle_deg : 0) : null, extinction: state.extinction };
  }
  // automatic: two modes for particles that turn; three (adds 20 D_R) between crossed polarizers, where the
  // scattered intensity alone carries the next orientation mode (validated there, not in dark field)
  function crossed() { return TRANS() && state.mode !== "dic" && state.polarizer === "on" && state.analyzer === "on" && state.pol_angle_deg >= 85; }
  function fitModel() { return state.fit_model === "auto" ? (state.shape === "sphere" ? "simple" : crossed() ? "three" : "two") : state.fit_model; }
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
  // what the chosen cause does to these particles, in words
  function fmtVel(v) { return Math.abs(v) < 0.1 ? fmtSig(v * 1000, 2) + " nm/s" : fmtSig(v, 3) + " " + MU + "m/s"; }
  function causeHint() {
    const D = dSE(), L = simPx() * pixelUm();
    if (state.cause === "none") return "The particles only diffuse: D = " + fmtSig(D, 3) + " " + MU + "m\u00b2/s.";
    if (state.cause === "flow") return state.flow_profile === "poiseuille" ? "Mean speed over the chamber; at the focus the liquid moves at " + fmtVel(expectedDrift().speed) + "." : "The whole liquid moves at the same speed, as when the stage moves or the sample slowly drifts.";
    if (state.cause === "sediment") {
      const v = stokesV(), lg = Math.abs(v) > 0 ? D / Math.abs(v) : Infinity;
      return "Densities " + particleDensity().toFixed(2) + " (particle) and " + liquidDensity().toFixed(3) + " g/cm" + SUP3 + " (liquid): Stokes settling at " + fmtVel(Math.abs(v)) + (v < 0 ? " upwards (the particles float)" : "") + ". " +
        (state.orient === "side" ? "With the microscope on its side gravity points down the image." : "With an upright microscope this is along the optical axis; the particles collect within about " + fmtSig(Math.min(lg, 1e4), 2) + " " + MU + "m of the " + (v < 0 ? "top" : "bottom") + ", and slow down near the glass.");
    }
    const ST = thermoST(), DT = thermoDT(), v = DT * state.grad, r = thermoRange();
    let h = "S_T = " + fmtSig(ST, 2) + " K\u207b\u00b9 at " + Math.round(state.T_C) + " " + DEG + "C, so D_T = S_T D = " + fmtSig(DT, 2) + " " + MU + "m\u00b2/(s K) and the drift is " + fmtVel(Math.abs(v)) + (DT >= 0 ? " towards the cold side." : " towards the warm side.");
    if (r && (state.T_C < r[0] || state.T_C > r[1])) h += " Outside the temperatures measured (" + r[0] + "-" + r[1] + " " + DEG + "C): the nearest value is used.";
    if (state.thermo_sys !== "custom" && THERMO[state.thermo_sys].d && Math.abs(state.diameter_um / THERMO[state.thermo_sys].d - 1) > 0.02) h += " The particles set are not those measured.";
    if (state.thermo_sys.indexOf("br") === 0) h += " Measured in a 1:1 mixture of water and heavy water; D here is for the liquid set.";
    if (state.grad_dir === "axis") h += " Along the optical axis the particles pile up within about " + fmtSig(Math.min(1 / Math.abs(ST * state.grad), 1e4), 2) + " " + MU + "m of one wall.";
    return h;
  }
  function visibleHint() {
    // can this drift be seen at all with this movie: q v dt must reach about 1 at a q where diffusion has not erased the pattern
    const ev = expectedDrift(); if (!ev.plane || !(ev.speed > 0)) return "";
    const D = dSE(), L = simPx() * pixelUm(), Pe = ev.speed * L / D;
    return "Peclet number over the field v L / D = " + fmtSig(Pe, 2) + (Pe < 2 * Math.PI ? ": below 2\u03c0, so even the widest pattern is renewed by diffusion before the drift moves it. Expect no drift to be seen." : Pe < 30 ? ": the drift shows only in the widest patterns." : ": the drift shows clearly.");
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
    }, driftConfig());
  }
  // the cause of the drift, as the simulator takes it: a drift in the image plane (speed, direction, profile across
  // the chamber), or along the optical axis (gravity, or a drift added to it), with the walls of the chamber
  function driftConfig() {
    const ev = expectedDrift();
    const c = { drift_um_s: 0, drift_deg: 0, drift_profile: "plug", drift_z_um_s: 0, gravity: false, walls: false };
    if (state.cause === "flow") { c.drift_um_s = state.flow_v; c.drift_deg = state.flow_deg; c.drift_profile = state.flow_profile; }
    else if (state.cause === "sediment") { if (state.orient === "side") { c.drift_um_s = ev.speed; c.drift_deg = ev.deg; } else { c.gravity = true; c.walls = true; } }
    else if (state.cause === "thermo") {
      // warmer to the right (in the plane) or at the top (along the axis); drift_z is positive downwards, like gravity
      if (state.grad_dir === "plane") { c.drift_um_s = ev.speed; c.drift_deg = ev.deg; }
      else { c.drift_z_um_s = thermoDT() * state.grad; c.walls = true; }
    }
    return c;
  }
  function analysisOptions() {
    return { q_min_per_um: state.q_min, q_max_per_um: state.q_max, windowing: state.windowing === "on",
      // what this page adds to the published method, each switchable at the "Addict" level, where the published
      // method alone also runs on the same movie for comparison
      noise: state.x_noise === "off" ? "fit" : undefined, velocity: state.x_phase === "off" ? "structure" : "phase", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const BODY = function () { return state.shape === "prolate" || state.shape === "oblate" || state.shape === "rod"; };
  const TURNS = function () { return state.shape !== "sphere"; };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "particle", group: "Sample", lvl: 1, label: "Material of the spheres", kind: "select", options: function () { return SHAPE_MATERIALS.sphere.map(function (k) { return [k, MATERIALS[k]]; }); } },
    { key: "n_custom", group: "Sample", lvl: 1, label: "Particle refractive index", kind: "lin", min: 1.3, max: 2.6, step: 0.01, fmt: function (v) { return v.toFixed(2); }, when: function () { return state.particle === "custom"; } },
    { key: "diameter_um", group: "Sample", lvl: 1, label: "Diameter", kind: "log", min: 0.03, max: 5, fmt: fmtSize, hint: function () { return "Stokes-Einstein: D = " + fmtSig(dSE(), 3) + " " + MU + "m\u00b2/s."; } },
    { key: "phi", group: "Sample", lvl: 2, label: "Concentration (volume fraction)", kind: "log", min: 1e-6, max: 1e-2, fmt: fmtPhi, hint: function () { return particleCount() + " particles in the simulated volume." + (phiCapped ? " Lowered to fit what the browser can follow (" + MAX_PARTICLES + " particles even in the smallest simulated field)." : "") + (phiRaised ? " Raised so that a few particles are in the simulated field." : ""); } },
    { key: "liquid", group: "Sample", lvl: 2, label: "Liquid", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", group: "Sample", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; } },
    { key: "n_liquid", group: "Sample", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", group: "Sample", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", group: "Sample", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", group: "Sample", lvl: 2, label: "Chamber thickness", kind: "log", min: 1, max: 500, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return particleCount() > 30000 ? "Too many particles for the browser (" + particleCount() + "): lower the concentration or simulate a smaller part of the image." : state.mode === "dic" && state.cell_um >= 200 ? "DIC is simulated in cells up to 200 " + MU + "m." : state.cell_um > 60 ? "Thick cells take longer to simulate (up to about 20 s): far from focus each particle's image changes with depth in many ways." : ""; } },
    { key: "focus_frac", group: "Sample", lvl: 2, label: "Focus height in the chamber", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },
    { key: "rho_custom", group: "Sample", lvl: 3, label: "Particle density", kind: "lin", min: 0.8, max: 4, step: 0.01, fmt: function (v) { return v.toFixed(2) + " g/cm" + SUP3; }, when: function () { return state.particle === "custom"; } },
    { key: "rho_liquid", group: "Sample", lvl: 3, label: "Liquid density", kind: "lin", min: 0.7, max: 2, step: 0.01, fmt: function (v) { return v.toFixed(2) + " g/cm" + SUP3; }, when: function () { return state.liquid === "custom"; } },

    // what moves the particles
    { key: "cause", group: "Sample", lvl: 1, label: "What carries the particles", kind: "select", options: [["none", "Nothing: they only diffuse"], ["flow", "A flow of the liquid"], ["sediment", "Gravity: sedimentation"], ["thermo", "A temperature gradient: thermophoresis"]], hint: causeHint },
    { key: "flow_v", group: "Sample", lvl: 1, label: "Flow speed", kind: "log", min: 0.01, max: 20, fmt: fmtVel, when: function () { return state.cause === "flow"; }, hint: visibleHint },
    { key: "flow_deg", group: "Sample", lvl: 2, label: "Flow direction in the image", kind: "lin", min: 0, max: 355, step: 5, fmt: function (v) { return Math.round(v) + DEG + " (" + dirWords(v) + ")"; }, when: function () { return state.cause === "flow"; } },
    { key: "flow_profile", group: "Sample", lvl: 2, label: "Flow across the chamber", kind: "select", options: [["plug", "The same at every height (plug flow)"], ["poiseuille", "Pushed through the chamber: fastest in the middle, still at the walls (Poiseuille)"]], when: function () { return state.cause === "flow"; } },
    { key: "orient", group: "Sample", lvl: 1, label: "Microscope", kind: "select", options: [["upright", "Standing: optical axis vertical, gravity along it"], ["side", "On its side: optical axis horizontal, gravity down the image"]], when: function () { return state.cause === "sediment"; }, hint: visibleHint },
    { key: "thermo_sys", group: "Sample", lvl: 2, label: "Measured system", kind: "select", options: Object.keys(THERMO).map(function (k) { return [k, THERMO[k].label]; }), when: function () { return state.cause === "thermo"; } },
    { key: "st_custom", group: "Sample", lvl: 3, label: "Soret coefficient S_T", kind: "lin", min: -3, max: 5, step: 0.05, fmt: function (v) { return fmtSig(v, 2) + " K\u207b\u00b9"; }, when: function () { return state.cause === "thermo" && state.thermo_sys === "custom"; } },
    { key: "grad", group: "Sample", lvl: 2, label: "Temperature gradient", kind: "log", min: 0.001, max: 0.2, fmt: function (v) { return fmtSig(v, 2) + " K/" + MU + "m"; }, when: function () { return state.cause === "thermo"; }, hint: function () { return "Duhr and Braun reached 0.1 K/" + MU + "m by heating water with an infrared laser over tens of micrometres; " + fmtSig(state.grad * state.cell_um, 2) + " K across the chamber here. " + visibleHint(); } },
    { key: "grad_dir", group: "Sample", lvl: 2, label: "Gradient direction", kind: "select", options: [["plane", "Across the image: warmer to the right"], ["axis", "Along the optical axis: warmer at the top"]], when: function () { return state.cause === "thermo"; } },

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
      options: function () { return [5, 10, 20, 50].map(function (k) { return [k, k + " times (" + fmtDur(movieSpanS(k)) + ")"]; }); } },
    { key: "sim_px", group: "Camera and recording", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]] },

    { key: "windowing", group: "Analysis", lvl: 2, label: "Windowing (Giavazzi et al. 2017)", kind: "select", options: [["off", "Off"], ["on", "On: each frame multiplied by a window that falls to zero at the edges"]],
      hint: function () { return state.windowing === "on" ? "Cells or particles that cross the edge of the image no longer leave bands along the axes of the map in step 4, nor a fast decay that swamps the finest patterns. The price: the window darkens the edges, so less of the field counts and the results scatter more, and patterns wider than a fifth of the field are left out (the window mixes each pattern with its neighbours)." : "The Fourier transform treats the image as one tile of a repeating pattern, so cells or particles crossing the edges make jumps at the tile borders. The central cross of the map is left out to remove most of their effect."; } },
    { key: "qrange", group: "Analysis", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // where each control sits: the imaging mode, then everything about the sample, the light reaching it, and how the
  // "Addict": the additions to the published method, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_noise", lvl: 4, label: "Camera noise known from the detector", kind: "select", options: ONOFF("B fitted at each q"),
      hint: function () { return "On: B = 2 (excess-noise factor x mean count + read noise\u00b2), the same at every q. Off: B fitted at each q, as in the published method."; } },
    { key: "x_phase", lvl: 4, label: "Velocity from the phase of the cross spectrum", kind: "select", options: ONOFF("v and D fitted together to the structure function"),
      hint: function () { return "On: v from the phase of <F(q, t + \u0394t) F*(q, t)>, which is -q\u00b7v \u0394t, sign included; D from the structure function with v fixed. Off: v and D fitted together to d(q, \u0394t) = A[1 - e^(-Dq\u00b2\u0394t) cos(q\u00b7v \u0394t)] + B, as published: no sign, and v can trade against D."; } }
  );

  // light is collected and recorded. Every control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Sample", [
      ["Particles", ["particle", "n_custom", "diameter_um", "phi", "dye", "rho_custom"]],
      ["What carries them", ["cause", "flow_v", "flow_deg", "flow_profile", "orient", "thermo_sys", "st_custom", "grad", "grad_dir"]],
      ["Liquid and temperature", ["liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "rho_liquid", "T_C"]],
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
      ["Addict: what this page adds", ["x_noise", "x_phase"]]]]
  ];
  // one-line summary under each block title: [setting, text before, text after]
  const SUMMARY = {
    "Sample": [["diameter_um"], ["particle"], ["cause"], ["flow_v"], ["orient"], ["grad"], ["liquid", "in "], ["T_C"]],
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
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, windowing: 1, x_noise: 1, x_phase: 1 };
  function fmtRate(v) { return fmtSig(v, 2) + " s" + "\u207b\u00b9"; }
  function shapeHint() {
    if (!TURNS()) return "";
    const hh = hydro(), t = 1 / (6 * hh.D_r);
    let s = "Turns: 6 D_R = " + fmtRate(6 * hh.D_r) + " (the axis forgets its direction in about " + fmtTime(t) + "). Translation D = " + fmtSig(hh.D_t, 2) + " " + MU + "m\u00b2/s.";
    if (state.mode === "dic") s += " DIC is simulated for spheres only.";
    else if (1 / state.frame_rate_hz > t) s += " The frame rate is too low to follow the rotation.";
    return s;
  }
  function polHint() {
    if (state.analyzer !== "on") return "";
    if (state.polarizer !== "on") return "With unpolarized light an analyzer only halves the light and selects one polarization of what the particles scatter.";
    const g = state.pol_angle_deg, bg = Math.pow(Math.cos(g * Math.PI / 180), 2) + state.extinction;
    return "Direct light passing: " + fmtSig(100 * bg, 2) + " %. Crossed polarizers block isotropic particles; slightly uncrossed ones (about 75" + DEG + ") let the depolarized light interfere with the background, which makes it stronger and simpler to analyse (p-DDM).";
  }
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
        inp.addEventListener("input", function () { out.textContent = c.fmt(read()); });
        inp.addEventListener("change", function () { state[c.key] = read(); onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, set: function (v) { inp.value = c.kind === "log" ? 1000 * Math.log(v / c.min) / Math.log(c.max / c.min) : v; out.textContent = c.fmt(v); } };
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
  let lastKey = null;
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
    // a measured thermophoretic system comes with its particles; other particles take the system's S_T as their own
    if (state.cause === "thermo") {
      const sys = THERMO[state.thermo_sys];
      if ((key === "thermo_sys" || key === "cause") && sys.d) { state.particle = "ps"; state.diameter_um = sys.d; }
      if ((key === "diameter_um" || key === "particle") && sys.d && (state.particle !== "ps" || Math.abs(state.diameter_um / sys.d - 1) > 0.02)) { state.st_custom = Math.round(thermoST() * 100) / 100; state.thermo_sys = "custom"; }
    }
    if (SCANNING() && (key === "mode" || key === "objective" || key === "scan_px")) autoZoom();
    if (key === "camera") { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; state.binning = 1; }
    constrain(); syncControls(); drawFov();
    if (ANALYSIS_KEYS[key]) scheduleAnalysis(); else schedule();
  }

  // ---- reader level -----------------------------------------------------------------
  function setLevel(lv, fromUser) {
    if (!LEVEL_RANK[lv]) lv = "curious";
    level = lv;
    document.documentElement.setAttribute("data-level", lv);
    $("lv-" + lv).checked = true;
    const lvOpen = lv === "addict" ? "researcher" : lv;
    document.querySelectorAll("details.math[data-open-at]").forEach(function (d) { d.open = (lvOpen === d.getAttribute("data-open-at")); });
    // controls hidden at this level go back to the standard value, so the bench shows what is simulated
    let changed = false, changedAna = false;   // a setting of the movie, or only of the analysis
    CONTROLS.forEach(function (c) {
      if (c.lvl <= LEVEL_RANK[lv]) return;
      if (c.kind === "qrange") { if (state.q_min !== null || state.q_max !== null) { state.q_min = null; state.q_max = null; changed = true; } return; }
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
    return ["optics-src", "movie-src", "engine-src", "drift-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
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
    const res = await drive(DRIFT.analyse(movie, opts), token, 0.85, opts.compare_published ? 0.93 : 1);
    if (!res) return;
    if (opts.compare_published) { const rp = await drive(DRIFT.analyse(movie, Object.assign({}, opts, { published_only: true })), token, 0.93, 1); if (!rp) return; res.published = DRIFT.publishedSummary(rp); }
    inflight = null;
    finish(movie, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  function finish(movie, res, cfg, opts) {
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    // a new movie: the delay where the patterns along the drift have swung about one and a half times before they fade,
    // v (t / D)^(1/2) = 4 pi (two fringes before the patterns fade), and a zoom of the lower maps on the patterns still there
    if (fresh) {
      const ta = res.taus_s, tw = res.detected ? res.D_um2_s * Math.pow(4 * Math.PI / res.v_um_s, 2) : ta[Math.floor(ta.length / 2)];
      let li = 0; for (let k = 0; k < ta.length; k++) if (Math.abs(Math.log(ta[k] / tw)) < Math.abs(Math.log(ta[li] / tw))) li = k;
      $("lag").max = ta.length - 1; $("lag").value = li;
      const kUsed = Math.round(res.window.q_to * movie.L_um / (2 * Math.PI)) + 1, kz = Math.round(2 / Math.sqrt(res.D_um2_s * ta[li]) * movie.L_um / (2 * Math.PI));
      cache.zoomK = Math.max(8, Math.min(kUsed, movie.n / 2 - 1, kz));
    }
    $("btn-times").hidden = !frameTimes();
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames of " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " particles."; idle();
    frameIdx = 0;
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
  let frameIdx = 0, playing = true, lastTick = 0, accum = 0;
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
      const fps = Math.max(8, Math.min(60, cache.movie.frame_rate_hz));
      accum += Math.min(0.1, (now - lastTick) / 1000) * fps;
      if (accum >= 1) { frameIdx = (frameIdx + Math.floor(accum)) % cache.movie.T; accum -= Math.floor(accum); drawMovieFrames(); }
    }
    lastTick = now;
    requestAnimationFrame(tick);
  }
  function drawMovieFrames() {
    drawFrame($("movie"), cache.movie, frameIdx);
    drawFrame($("hero-canvas"), cache.movie, frameIdx);
    drawDiff(frameIdx);
    const dt = 1 / cache.movie.frame_rate_hz, fps = Math.max(8, Math.min(60, cache.movie.frame_rate_hz)), speed = fps / cache.movie.frame_rate_hz, tt = cache.movie.times_s;
    if (tt) { $("movie-time").textContent = "Frame " + (frameIdx + 1) + " of " + cache.movie.T + ", taken at t = " + fmtSig(tt[frameIdx], 3) + " s of " + fmtDur(tt[cache.movie.T - 1] + dt) + ". Frames taken at log-spaced times, shown one after the other."; return; }
    $("movie-time").textContent = "t = " + (frameIdx * dt).toFixed(dt < 0.01 ? 3 : dt < 0.1 ? 2 : 1) + " s of " + fmtSig(cache.movie.T * dt, 3) + " s" +
      (Math.abs(speed - 1) > 0.01 ? (speed < 1 ? ", slowed down " + fmtNum(1 / speed) + " times" : ", sped up " + fmtNum(speed) + " times") : ", real time");
  }

  // ---- map and stripe pattern ------------------------------------------------------------
  let sel = null;
  // a pattern along the drift, in the middle of the q used
  function pickDefaultSelection() {
    const res = cache.res, n = cache.movie.n, bins = res.bins.map(function (e) { return e.b; });
    const b = bins[Math.floor(bins.length / 3)] || 4, th = res.detected ? res.v_dir_deg * Math.PI / 180 : 0.5;
    sel = { kx: Math.round(b * Math.cos(th)) || 1, ky: -Math.round(b * Math.sin(th)) || 1 };
    if (Math.hypot(sel.kx, sel.ky) > n / 2) sel = { kx: 4, ky: 2 };
  }
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
    drawMapOverlay(); drawFmap(); drawPhase();
    const qz = cache.zoomK * 2 * Math.PI / cache.movie.L_um;
    $("zoom-note").textContent = (level === "curious" ? "The centre of the map above" : "Both maps: the centre of the one above") + ", lightly smoothed, q up to " + fmtSig(qz, 2) + " " + MU + "m\u207b\u00b9 (stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m), at the same delay.";
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
      const i0 = zoomIndex(X, Y, K, n); if (!(cache.res.binOf[i0] > 0) || !cache.res.amp.get(cache.res.binOf[i0])) { out[Y * m + X] = null; continue; }
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
    const f = smoothed(K, n, function (i) { const b = res.binOf[i], e = b > 0 ? res.amp.get(b) : null; return e && e.A > 0 ? [1 - (map[i] - e.B) / e.A, 0] : null; });
    for (let k = 0; k < m * m; k++) { const col = f[k] ? divColor(f[k][0]) : grey, p = 4 * k; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  // phase of the cross spectrum, arg C = -q.v dt: a colour wheel; brightness from how much of the pattern is left
  function hsl(h, s, l) { const f = function (k) { const kk = (k + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1)); }; return [255 * f(0), 255 * f(8), 255 * f(4)]; }
  function drawPhase() {
    const res = cache.res, n = cache.movie.n, c = $("phmap"); if (!c) return;
    const K = cache.zoomK, m = 2 * K + 1; if (c.width !== m) { c.width = m; c.height = m; }
    const cr = res.cross[lagIndex()], ctx = c.getContext("2d"), img = ctx.createImageData(m, m), d = img.data, bg = hexToRgb(C.paper);
    // C / (A / 2): its length is how much of the pattern is left, its angle how far the pattern travelled
    const z = smoothed(K, n, function (i) { const b = res.binOf[i], e = b > 0 ? res.amp.get(b) : null; return e && e.A > 0 ? [cr[2 * i] / (e.A / 2), cr[2 * i + 1] / (e.A / 2)] : null; });
    for (let k = 0; k < m * m; k++) {
      let col = bg;
      if (z[k]) {
        const amp = Math.min(1, Math.hypot(z[k][0], z[k][1])), h = ((Math.atan2(z[k][1], z[k][0]) * 180 / Math.PI) + 360) % 360;
        col = lerp3(bg, hsl(h, 0.85, 0.5), amp).map(function (v) { return Math.round(v); });
      }
      const p = 4 * k; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  function drawStripes() {
    const n = cache.movie.n, c = $("stripes"); if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 128 + 110 * Math.cos(2 * Math.PI * (sel.kx * x + sel.ky * (n - 1 - y)) / n), p = 4 * (y * n + x); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = Math.hypot(sel.kx, sel.ky), q = 2 * Math.PI * k / cache.movie.L_um, spacing = cache.movie.L_um / k, ang = Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI);
    const res = cache.res, v = res.v_um_s, th = res.v_dir_deg * Math.PI / 180, qv = (2 * Math.PI / cache.movie.L_um) * (sel.kx * Math.cos(th) - sel.ky * Math.sin(th)) * v;
    let txt = "Stripe spacing <b>" + fmtSig(spacing, 2) + " " + MU + "m</b>";
    if (level !== "curious") txt += ", q = <b>" + q.toFixed(2) + " " + MU + "m<sup>-1</sup></b>, direction " + ang + "&deg;";
    txt += ". Diffusion renews it in about <b>" + fmtTime(1 / (res.D_um2_s * q * q)) + "</b>";
    if (res.detected) txt += Math.abs(qv) > 1e-9 ? "; the drift carries it by one full spacing in <b>" + fmtTime(2 * Math.PI / Math.abs(qv)) + "</b>" : "; stripes along the drift are not moved by it";
    $("pick-out").innerHTML = txt + ".";
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
      else { const step = niceStep((hi - lo) / 5); for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push({ v: v, major: true }); }
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
  function setQSpan() { const w = cache.res.window; qSpan = [w.q_from, w.q_to]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }
  // curves along and across the drift: how much of each pattern is left (f), with the model
  function drawSector(canvas, rows, along, legendId) {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    const a = axes(canvas, { xlog: true, ylog: false, x0: x0, x1: x1, y0: -1.05, y1: 1.15, xlabel: "Delay (s)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    const pick = [], k = Math.min(6, rows.length);
    for (let i = 0; i < k; i++) pick.push(rows[Math.round(i * (rows.length - 1) / Math.max(1, k - 1))]);
    const D = res.D_um2_s, v = res.detected ? res.v_um_s : 0;
    pick.forEach(function (r) {
      const col = qColor(qPos(r.q_per_um)), q = r.q_per_um;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      // the curves average directions within about 15 degrees of the axis: so does the model
      for (let i = 0; i <= 160; i++) {
        const t = x0 * Math.pow(x1 / x0, i / 160); let c = 0;
        for (let k = -3; k <= 3; k++) { const ph = k / 3 * Math.PI / 12; c += Math.cos(q * v * t * (along ? Math.cos(ph) : Math.sin(ph))) / 7; }
        const f = Math.exp(-D * q * q * t) * c, X = a.fx(t), Y = a.fy(f); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      for (let li = 0; li < taus.length; li++) dot(ctx, a.fx(taus[li]), a.fy(r.f[li]), 2.4, col, null);
    });
    a.done();
    const leg = $(legendId); leg.innerHTML = "";
    pick.forEach(function (r) { const s = document.createElement("span"); s.innerHTML = '<i style="background:' + qColor(qPos(r.q_per_um)) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / r.q_per_um, 2) + " " + MU + "m" : "q = " + r.q_per_um.toFixed(2)); leg.appendChild(s); });
  }
  function drawCurves() {
    const res = cache.res;
    if (!res.along.length || !res.across.length) return;
    drawSector($("chart-along"), res.along, true, "along-legend");
    drawSector($("chart-across"), res.across, false, "across-legend");
  }
  // rates of fading (Gamma, dots) and of oscillation (omega, squares) against q
  function drawRates() {
    const res = cache.res, w = res.window, pts = res.per_q;
    const x0 = w.q_from / 1.4, x1 = w.q_to * 1.4, y0 = w.gamma_lo_hz / 8, y1 = w.gamma_hi_hz * 8;
    const a = axes($("chart-rates"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1,
      xlabel: level === "curious" ? "Finer patterns \u2192   (wave vector q, " + MU + "m\u207b\u00b9)" : "Wave vector q (" + MU + "m\u207b\u00b9)",
      ylabel: level === "curious" ? "How fast (1/s)" : "\u0393 and \u03c9 (s\u207b\u00b9)" }), ctx = a.ctx;
    ctx.fillStyle = C.tint; ctx.globalAlpha = 0.9;
    const shade = function (xa, ya, xb, yb) { ctx.fillRect(a.fx(xa), a.fy(yb), a.fx(xb) - a.fx(xa), a.fy(ya) - a.fy(yb)); };
    shade(x0, y0, x1, w.gamma_lo_hz); shade(x0, w.gamma_hi_hz, x1, y1); ctx.globalAlpha = 1;
    const line = function (f, col, dash) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.fx(x0), a.fy(f(x0))); ctx.lineTo(a.fx(x1), a.fy(f(x1))); ctx.stroke(); ctx.setLineDash([]); };
    line(function (q) { return res.D_um2_s * q * q; }, C.ink, []);
    if (res.detected) line(function (q) { return res.v_um_s * q; }, C.accent, []);
    if (level !== "curious") {
      const tr = cache.movie.truth, ev = expectedDrift();
      line(function (q) { return tr.D_um2_s * q * q; }, C["accent-2"], [7, 4]);
      if (ev.plane && ev.speed > 0) line(function (q) { return ev.speed * q; }, C["accent-2"], [2, 3]);
    }
    pts.forEach(function (e) {
      const col = qColor(qPos(e.q_per_um)), X = a.fx(e.q_per_um);
      if (e.ok) dot(ctx, X, a.fy(e.gamma_hz), 3.4, col, null); else dot(ctx, X, a.fy(e.gamma_hz), 3, null, C.muted);
      if (res.detected && e.omega_rad_s > 0 && e.q_per_um * res.v_um_s * res.taus_s[res.taus_s.length - 1] > 1) { const Y = a.fy(e.omega_rad_s), r = 3.2; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.strokeRect(X - r, Y - r, 2 * r, 2 * r); }
    });
    a.done();
    const ul = $("reasons"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    add("Dots: how fast each pattern fades (\u0393), on the black line D q\u00b2 of slope 2." + (res.detected ? " Squares: how fast it oscillates along the drift (\u03c9), on the blue line v q of slope 1." : ""));
    if (level !== "curious") add("Dashed red: what the simulated particles should give (D q\u00b2 and, dotted, v q for the drift set).");
    if (res.detected) add("Where the blue line is below the black one, diffusion renews the pattern before the drift moves it: only the widest patterns (left) show the drift.");
  }
  // speed seen along each direction of q: v cos(theta - theta_v)
  function drawSectorV() {
    const res = cache.res, c = $("chart-sector"); if (!c || LEVEL_RANK[level] < 3) return;
    const pts = res.sector_v.filter(function (e) { return e.v_um_s !== null; });
    const vmax = Math.max(0.1, res.v_um_s * 1.3, Math.max.apply(null, pts.map(function (e) { return Math.abs(e.v_um_s); })) * 1.15);
    const a = axes(c, { xlog: false, ylog: false, x0: 0, x1: 180, y0: -vmax, y1: vmax, xlabel: "Direction of q (" + DEG + ")", ylabel: "v along q (" + MU + "m/s)" }), ctx = a.ctx;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 90; i++) { const th = 2 * i, v = res.v_um_s * Math.cos((th - res.v_dir_deg) * Math.PI / 180), X = a.fx(th), Y = a.fy(v); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.stroke();
    pts.forEach(function (e) { dot(ctx, a.fx(e.theta_deg), a.fy(e.v_um_s), 3.4, C.ink, null); });
    a.done();
  }

  // ---- result -------------------------------------------------------------------------------
  const MODE_SHORT = { brightfield: "bright-field", phase: "phase-contrast", darkfield: "dark-field", dic: "DIC", fluorescence: "widefield fluorescence", spinning: "spinning-disk confocal (X-Light V3)", scanning: "point-scanning confocal (AX R)" };
  function spotWidth() { return 0.61 * centralWavelength() / Math.min(objective().na, nLiquid(centralWavelength())); }
  function pctTxt(x) { return x === null || x === undefined || !isFinite(x) ? "-" : (100 * x < 1 ? "<1" : Math.round(100 * x)) + " %"; }
  // the direction of a drift in words (y points down the image)
  function dirWords(deg) {
    const d = ((deg % 360) + 360) % 360, names = ["to the right", "down and to the right", "down the image", "down and to the left", "to the left", "up and to the left", "up the image", "up and to the right"];
    return names[Math.round(d / 45) % 8];
  }
  function dirTxt(deg) { return dirWords(deg) + (level !== "curious" ? " (" + Math.round(((deg % 360) + 360) % 360) + DEG + ")" : ""); }
  function fmtV(v) { return Math.abs(v) < 0.1 ? fmtSig(v * 1000, 2) + " nm/s" : fmtSig(v, 3) + " " + MU + "m/s"; }
  function verdictDrift() {
    const res = cache.res, ev = expectedDrift();
    if (!ev.plane && ev.speed > 0) return res.detected ? { cls: "warn", text: "A drift in the image plane, though there is none" } : { cls: "info", text: "The drift is along the optical axis: none in the image" };
    if (!res.detected) return !res.visibility.visible ? { cls: "info", text: ev.speed > 0 ? "Too slow to see with this movie" : "No drift, none found" } : { cls: ev.speed > 0 ? "warn" : "good", text: ev.speed > 0 ? "Not detected" : "No drift, none found" };
    if (!(ev.speed > 0)) return { cls: "bad", text: "A drift found where there is none" };
    let dev = res.v_um_s / ev.speed - 1;
    if (ev.lo !== undefined) dev = res.v_um_s < ev.lo ? res.v_um_s / ev.lo - 1 : res.v_um_s > ev.hi ? res.v_um_s / ev.hi - 1 : 0;
    const ang = Math.abs(((res.v_dir_deg - ev.deg) % 360 + 540) % 360 - 180);
    if (res.velocity_from === "structure" && Math.abs(ang - 180) < 20) return { cls: "warn", text: "Speed right, direction unknown (structure function)" };
    // within 10 % and 10 degrees, or within 2.5 times the quoted uncertainty
    const sv = (res.v_err_um_s || 0) / ev.speed, sa = res.v_dir_err_deg || 0, angOk = ang < Math.max(10, 2.5 * sa) || res.velocity_from === "structure";
    if (Math.abs(dev) < Math.max(0.1, 2.5 * sv) && angOk) return { cls: "good", text: ev.lo !== undefined ? "Between the mean flow and the flow at the focus" : Math.abs(dev) < 0.1 ? "Matches the drift set (within 10 %)" : "Matches the drift set within its uncertainty" };
    return Math.abs(dev) < Math.max(0.25, 5 * sv) && ang < Math.max(25, 5 * sa) ? { cls: "warn", text: "Off by " + Math.round(100 * Math.abs(dev)) + " %" + (ang >= 10 ? ", " + Math.round(ang) + DEG + " in direction" : "") } : { cls: "bad", text: "Off by " + Math.round(100 * Math.abs(dev)) + " %" };
  }
  function causeText() {
    const ev = expectedDrift();
    if (state.cause === "flow") return "a flow of " + fmtV(state.flow_v) + " " + dirWords(state.flow_deg) + (state.flow_profile === "poiseuille" ? " (mean over the chamber; faster in the middle, still at the walls)" : "");
    if (state.cause === "sediment") return "gravity: Stokes settling at " + fmtV(Math.abs(stokesV())) + (state.orient === "side" ? ", " + (stokesV() >= 0 ? "down" : "up") + " the image (microscope on its side)" : ", along the optical axis (upright microscope)");
    return "a temperature gradient of " + fmtSig(state.grad, 2) + " K/" + MU + "m " + (state.grad_dir === "axis" ? "along the optical axis (warmer at the top)" : "across the image (warmer to the right)") + ": D_T = " + fmtSig(thermoDT(), 2) + " " + MU + "m\u00b2/(s K), drift " + fmtV(ev.speed) + (ev.plane ? " " + dirWords(ev.deg) : " along the optical axis");
  }
  function renderResult() {
    const res = cache.res, mv = cache.movie, tr = mv.truth, v = verdictDrift(), ev = expectedDrift(), trD = tr.D_seen_um2_s || tr.D_um2_s;
    let h = '<div class="eyebrow">Result</div>';
    h += res.detected ? '<div class="big">' + fmtV(res.v_um_s) + (res.v_err_um_s ? ' <small>&plusmn; ' + fmtV(res.v_err_um_s) + '</small>' : '') + '</div><p class="small" style="margin:0">' + (res.velocity_from === "structure" ? "along the line " + Math.round(((res.v_dir_deg % 180) + 180) % 180) + DEG + ", either way (the structure function has no sign)" : dirTxt(res.v_dir_deg) + (level !== "curious" && res.v_dir_err_deg ? " &plusmn; " + Math.round(res.v_dir_err_deg) + DEG : "")) + '</p>'
      : '<div class="big">No drift seen</div>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    h += '<p class="small" style="margin:0">Set: ' + causeText() + '. Diffusion ' + fmtSig(res.D_um2_s, 3) + ' ' + MU + 'm\u00b2/s, so a size of ' + fmtSize(res.diameter_um) + ' (true ' + fmtSize(tr.diameter_um) + (Math.abs(trD / tr.D_um2_s - 1) > 0.05 ? '; near the glass they diffuse at ' + fmtSig(trD, 3) + ' ' + MU + 'm\u00b2/s on average, as ' + fmtSize(tr.diameter_seen_um) + ' particles would in the bulk' : '') + ').</p>';
    // can the drift be seen at all, in words
    const vis = res.visibility;
    if (!res.detected) {
      let t = "";
      if (ev.plane && ev.speed > 0) {
        // the slowest drift this movie can show: at least three q where q v t_max > 1 and q < 2 v / D, and three times its uncertainty
        const qs = res.per_q.map(function (e) { return e.q_per_um; }), tmax = res.taus_s[res.taus_s.length - 1];
        const vmin = Math.max(res.D_um2_s * qs[Math.min(2, qs.length - 1)] / 2, 1 / (qs[0] * tmax), 3 * (res.v_err_um_s || 0));
        const pe = ev.speed * mv.L_um / res.D_um2_s;
        t = "A drift shows only in patterns that it moves by a good part of a stripe before diffusion has mixed them up. This movie can show drifts faster than about " + fmtV(vmin) + "; the one set is " + fmtV(ev.speed) + " (v L / D = " + fmtSig(pe, 2) + " over the field, where about 2\u03c0 or more is needed). Larger particles, a stronger push, a lower magnification (a wider field) or a longer movie help.";
      } else if (!ev.plane && ev.speed > 0) {
        const lg = Math.abs(state.cause === "sediment" ? dSE() / stokesV() : 1 / (thermoST() * state.grad));
        t = "The drift is along the optical axis, and DDM sees motion in the image plane only. " + (lg < state.cell_um / 3 ? "The particles have piled up within about " + fmtSig(lg, 2) + " " + MU + "m of the " + ((state.cause === "sediment" ? stokesV() > 0 : thermoDT() > 0) ? "bottom" : "top") + " glass, where the liquid squeezing past slows their diffusion: in the bulk the same D would mean larger particles." : "The particles leave the focus slightly faster in one direction, so the curves fade a little faster.");
      }
      if (t) h += '<p class="small" style="margin:0">' + t + '</p>';
    }
    if (level !== "curious") {
      const row = function (cls, name, vv, dir, D, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + (vv === null ? "-" : fmtV(vv)) + '</td><td>' + (dir === null ? "-" : Math.round(((dir % 360) + 360) % 360) + DEG) + '</td><td>' + (D ? fmtSig(D, 3) : "-") + '</td></tr>'; };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">Speed</th><th scope="col">Direction</th><th scope="col">D (' + MU + 'm\u00b2/s)</th></tr></thead><tbody>';
      t += row("main", res.velocity_from === "structure" ? "Structure function (v and D together)" : "Phase of the cross spectrum, D from the structure function", res.detected ? res.v_um_s : null, res.detected ? res.v_dir_deg : null, res.D_um2_s, "the headline");
      if (LEVEL_RANK[level] >= 3 && res.velocity_from !== "structure") t += row("", "Structure function alone", res.from_structure_function.v_um_s, null, res.from_structure_function.D_um2_s, "v and D together; cos(q\u00b7v \u0394t) has no sign and can trade against diffusion");
      if (level === "addict" && res.published) t += row("pub", "Published method only", res.published.v_um_s, null, res.published.D_um2_s, "the same movie, B fitted at each q, v from the structure function");
      t += row("truth", "True (simulation)", ev.plane ? ev.speed : 0, ev.plane && ev.speed > 0 ? ev.deg : null, trD, ev.plane ? (ev.lo !== undefined ? "at the focus; " + fmtV(state.flow_v) + " on average over the chamber, the microscope sees a mix of heights" : "") : "drift along the optical axis: " + fmtV(ev.speed));
      t += '</tbody></table></div>';
      h += t;
      // what the drift says about its cause
      if (res.detected && state.cause === "sediment" && state.orient === "side") {
        const a = res.diameter_um / 2 * 1e-6, drho = 9 * viscosity_mPa_s() * 1e-3 * res.v_um_s * 1e-6 / (2 * G * a * a) / 1000;
        h += '<p class="small" style="margin:0">From the settling speed and the size: density difference ' + fmtSig(drho, 2) + ' g/cm' + SUP3 + ' (set ' + fmtSig(particleDensity() - liquidDensity(), 2) + ').</p>';
      }
      if (res.detected && state.cause === "thermo" && state.grad_dir === "plane") {
        const sgn = Math.cos(res.v_dir_deg * Math.PI / 180) < 0 ? 1 : -1, DT = sgn * res.v_um_s / state.grad, ST = DT / res.D_um2_s;
        h += '<p class="small" style="margin:0">From the drift and the gradient: D_T = ' + fmtSig(DT, 2) + ' ' + MU + 'm\u00b2/(s K) and S_T = D_T / D = ' + fmtSig(ST, 2) + ' K\u207b\u00b9 (set ' + fmtSig(thermoDT(), 2) + ' and ' + fmtSig(thermoDT() / dSE(), 2) + '). ' + (DT > 0 ? "Positive: the particles move to the cold side." : "Negative: they move to the warm side.") + '</p>';
      }
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Uncertainty</dt><dd>' + (res.velocity_from === "structure" ? 'speed from the scatter of the fits at each q' : 'two jackknifes combined: over ten parts of the movie, and over eight interleaved groups of q (each left out in turn)') + '; D from the scatter of &Gamma;/q&sup2; between q (' + pctTxt(res.D_rel_err) + ')</dd>';
      h += '<dt>Visible drift</dt><dd>' + (vis.visible ? 'in the patterns from q = ' + fmtSig(vis.q_from, 2) + ' to ' + fmtSig(vis.q_to, 2) + ' ' + MU + 'm\u207b\u00b9 (' + vis.n_q + ' q)' : 'in no pattern of this movie') + '; q* = v/D = ' + fmtSig(vis.q_star, 2) + ' ' + MU + 'm\u207b\u00b9, Peclet number v L / D = ' + fmtSig(vis.peclet, 2) + '</dd>';
      h += '<dt>Camera noise</dt><dd>' + (res.noise_B ? 'B = ' + fmtSig(res.noise_B, 3) + ' from the mean count, the read noise and the excess-noise factor, the same at every q' : 'B fitted at each q') + '</dd>';
      h += '<dt>Pixels used for the phase</dt><dd>' + res.v_jack.n_pixels + ' (pixel and delay pairs where the pattern is still clearly there and the phase has not wrapped)</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h;
    $("hero-result").innerHTML = '<span>Drift set</span><span class="n">' + (!(ev.speed > 0) ? "none" : !ev.plane ? "along the axis" : ev.lo !== undefined ? fmtSig(ev.lo, 2) + " to " + fmtV(ev.hi) : fmtV(ev.speed)) + '</span><span>Measured by DDM</span><span class="n">' + (res.detected ? fmtV(res.v_um_s) : "none seen") + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie, " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  function visibilityText(cfg, m) {
    const w = spotWidth(), d = cfg.diameter_um;
    if (d >= w) return "These particles are larger than the smallest detail the microscope resolves, so you see each one as a small disc or ring.";
    return "Each particle is smaller than the smallest detail the microscope resolves (about " + fmtSig(w, 2) + " " + MU + "m here), so it shows as a blurred spot of about that width.";
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg;
    const modeTxt = { brightfield: "a bright-field microscope", phase: "a phase-contrast microscope", darkfield: "a dark-field microscope", dic: "a DIC microscope", fluorescence: "a widefield fluorescence microscope", spinning: "a spinning-disk confocal microscope", scanning: "a point-scanning confocal microscope" }[state.mode];
    $("movie-text").textContent = "The movie shows " + fmtSize(cfg.diameter_um) + " " + MATERIALS[state.particle].toLowerCase().replace(" (set the index)", "") + " particles in " + (LIQUIDS[state.liquid].toLowerCase()) + ", filmed through " + modeTxt + " " + fmtNum(cfg.frame_rate_hz) + " times a second. They jiggle, and " + causeText() + " carries them along. " + visibilityText(cfg, m);
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + (m.times_s ? m.T + " frames at log-spaced times over " + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) : m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s") + ". Chamber " + cfg.cell_um + " " + MU + "m thick, focus " + fmtSig(cfg.focus_um, 2) + " " + MU + "m above the bottom, " + m.info.n_particles + " particles.";
    $("diff-note").textContent = "A particle that moved leaves a pair of spots, one darker and one brighter, at its old and its new place. With a drift the pairs all point the same way, but diffusion hides it until the delay is long enough.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const r = cache.res;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: state.mode, detector: SCANNING() ? "Nikon AX R, " + SCANNERS[state.scanner].label : cam().label, simulation: cache.cfg, analysis: cache.opts,
      result: { v_um_s: +r.v_um_s.toPrecision(4), v_err_um_s: r.v_err_um_s ? +r.v_err_um_s.toPrecision(2) : null, direction_deg: +r.v_dir_deg.toFixed(1), detected: r.detected, D_um2_s: +r.D_um2_s.toPrecision(4), diameter_nm: Math.round(r.diameter_um * 1000), visibility: { q_star_per_um: +r.visibility.q_star.toPrecision(3), peclet: +r.visibility.peclet.toPrecision(3), n_q: r.visibility.n_q } } };
    $("settings-json").textContent = JSON.stringify(obj, null, 1);
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + (res.pairs ? " (" + res.lags[li] + (res.lags[li] === 1 ? " frame interval, " : " frame intervals, ") + res.pairs[li].length / 2 + " pairs of frames)" : " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)")); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawRates(); drawSectorV(); renderResult(); renderSettings();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const SILICA2 = { particle: "silica", diameter_um: 2, phi: 2e-3, frame_rate_hz: 20, exposure_ms: 1, cause: "sediment" };
  const CARDS = [
    { lvl: 1, title: "Too slow to see", text: "200 nm polystyrene beads are only 5 % denser than water and settle at about 1 nm/s, while they wander by about a micrometre every half second. No pattern of this movie lasts long enough for the drift to move it: the page says the drift cannot be seen, and why.",
      shows: [{ label: "Show me", set: { cause: "sediment", orient: "side", particle: "ps", diameter_um: 0.2, phi: 2e-4, frame_rate_hz: 100, exposure_ms: 0.2, objective: objIndexByName("CFI Plan Fluor 20X") }, go: "step-rates" }] },
    { lvl: 1, title: "Heavy beads, microscope on its side", text: "Silica beads of 2 " + MU + "m settle at about 2 " + MU + "m/s and diffuse slowly. With the microscope on its side gravity points down the image: the fringes of step 4 appear, the curves along the drift swing, and the speed comes out with its direction. With the microscope upright the same beads settle onto the bottom glass: no drift in the image, and slower diffusion near the glass.",
      shows: [{ label: "On its side", set: Object.assign({ orient: "side" }, SILICA2), go: "step-map" }, { label: "Upright", set: Object.assign({ orient: "upright", focus_frac: 0.05 }, SILICA2), go: "step-rates" }] },
    { lvl: 1, title: "Faster flow, closer fringes", text: "The fringes in the maps of step 4 are spaced 2\u03c0/(v \u0394t) apart in q: twice the speed, twice as many fringes at the same delay. Move the delay slider to watch them close in.",
      shows: [{ label: "Flow 20 " + MU + "m/s", set: { flow_v: 20 }, go: "step-map" }, { label: "Flow 5 " + MU + "m/s", set: { flow_v: 5 }, go: "step-map" }] },
    { lvl: 2, title: "A flow that changes with depth", text: "Pushed through a channel, a liquid moves fastest in the middle and not at all at the walls (Poiseuille flow). The microscope averages over its depth of field, so near the middle it sees close to the top speed and near a wall much less; the spread of speeds also washes out the stripes at high q.",
      shows: [{ label: "Focus in the middle", set: { flow_profile: "poiseuille" }, go: "step-rates" }, { label: "Focus near the bottom", set: { flow_profile: "poiseuille", focus_frac: 0.1 }, go: "step-rates" }] },
    { lvl: 2, title: "Thermophoresis: 500 nm polystyrene in a strong gradient", text: "Polystyrene beads of 506 nm (Braibanti, Vigolo and Piazza 2008) at 35 " + DEG + "C move to the cold side with D_T of about 2.7 " + MU + "m\u00b2/(s K). In a gradient of 0.1 K/" + MU + "m, the steepest used by Duhr and Braun (2006), that is about 0.3 " + MU + "m/s: visible with a 4x objective (a wide field) and a long movie. At 5 " + DEG + "C S_T is negative: the same beads move four times more slowly, and the other way, to the warm side.",
      shows: [{ label: "35 " + DEG + "C", set: { cause: "thermo", thermo_sys: "br253", particle: "ps", diameter_um: 0.506, T_C: 35, grad: 0.1, objective: objIndexByName("CFI Plan Fluor 4X"), frame_rate_hz: 5, exposure_ms: 1, n_frames: 512, phi: 1e-3 }, go: "step-rates" },
              { label: "5 " + DEG + "C", set: { cause: "thermo", thermo_sys: "br253", particle: "ps", diameter_um: 0.506, T_C: 5, grad: 0.1, objective: objIndexByName("CFI Plan Fluor 4X"), frame_rate_hz: 5, exposure_ms: 1, n_frames: 512, phi: 1e-3 }, go: "step-rates" }] },
    { lvl: 2, title: "Thermophoresis of small beads: invisible", text: "200 nm beads (Duhr and Braun 2006) in a gradient of 0.01 K/" + MU + "m drift at 14 nm/s, while they diffuse 150 times faster across any pattern the image holds. DDM cannot see this drift; thermophoresis of small particles is measured instead from the concentration gradient it builds up, with a beam or by fluorescence.",
      shows: [{ label: "Show me", set: { cause: "thermo", thermo_sys: "duhr200", particle: "ps", diameter_um: 0.2, phi: 2e-4, frame_rate_hz: 100, exposure_ms: 0.2, objective: objIndexByName("CFI Plan Fluor 20X"), grad: 0.01 }, go: "step-rates" }] },
    { lvl: 3, title: "The structure function alone", text: "Most DDM analyses of drift fit cos(q\u00b7v \u0394t) to the structure function. When the patterns fade before they oscillate, the oscillation trades against diffusion and the speed comes out wrong; it also never gives the direction's sign. The phase of the cross spectrum has neither problem. Compare the two rows of the result table.",
      shows: [{ label: "200 nm beads, 2 " + MU + "m/s", set: { flow_v: 2, particle: "ps", diameter_um: 0.2, phi: 2e-4, frame_rate_hz: 100, exposure_ms: 0.2, objective: objIndexByName("CFI Plan Fluor 20X") }, go: "step-rates" }, { label: "200 nm beads, no drift", set: { cause: "none", particle: "ps", diameter_um: 0.2, phi: 2e-4, frame_rate_hz: 100, exposure_ms: 0.2, objective: objIndexByName("CFI Plan Fluor 20X") }, go: "step-rates" }] }
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
    if (state.mode === "scanning" && !set.zoom) autoZoom();
    if (set.camera && !set.cam_mode) { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; }
    constrain(); syncControls(); drawFov(); schedule();
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
          if (kind === "reverse") { state.cause = "flow"; state.flow_deg = (state.flow_deg + 180) % 360; }
          if (kind === "double") { state.cause = "flow"; state.flow_v = Math.min(20, 2 * state.flow_v); }
          constrain();
          syncControls(); schedule();
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
  $("btn-copy").addEventListener("click", function () {
    const txt = $("settings-json").textContent;
    const fallback = function () { const r = document.createRange(); r.selectNodeContents($("settings-json")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("btn-copy").textContent = "Selected, press copy"; };
    try { navigator.clipboard.writeText(txt).then(function () { $("btn-copy").textContent = "Copied"; }, fallback); } catch (e) { fallback(); }
  });
  let rz = null;
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawRates(); drawSectorV(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const PAGE_NAME = "drift";
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
  function parseHash(h) {
    const parts = String(h || "").replace(/^#/, "").split("/"), set = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      const i = kv.indexOf("="); if (i < 1) return;
      let k, raw; try { k = decodeURIComponent(kv.slice(0, i)); raw = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (!Object.prototype.hasOwnProperty.call(BASE, k)) return;
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
    expected: expectedDrift,
    result: function () { const r = cache && cache.res; return r ? { D: r.D_um2_s, d: r.diameter_um, v: r.v_um_s, v_err: r.v_err_um_s, dir: r.v_dir_deg, detected: r.detected, from: r.velocity_from, visible: r.visibility.visible, sf_v: r.from_structure_function.v_um_s, published: r.published || null } : null; }
  };
})();
