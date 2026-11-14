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

  // the standard sample: 200 nm polystyrene beads in water, 20x / 0.5, ELWD condenser fully open, green filter
  const BASE = {
    mode: "brightfield", particle: "ps", n_custom: 1.59, diameter_um: 0.2, size_spread: 0, size_dist: "schulz", phi: 2e-4,
    liquid: "water", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 20, focus_frac: 0.5, drift_um_s: 0, settle: "off", rho_custom: 1.05, rho_liquid: 1.0, optics: "auto",
    objective: objIndexByName("CFI Plan Fluor 20X"), condenser: "elwd", na_c: 0.3, source: "green",
    dye: "green", rate_ph_ms: 200, bg_e_ms: 2, light_frac: 0.5,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 1, roi: 512, sim_px: 128, n_frames: 256,
    annulus: "Ph2", ring_T: 0.25, df_kind: "dry", df_light_e: 1e7, stray_frac: 1e-4, dic_shear_um: 0.24, dic_bias_deg: 90, dic_angle_deg: 45,
    scanner: "resonant", scan_px: 512, zoom: 1, line_avg: 2, pinhole_au: 1, scan_rate: 2e7,
    frame_rate_hz: 100, exposure_ms: 0.2, frame_timing: "even", log_factor: 20,
    shape: "sphere", aspect: 3, dn: 0.1, dn_body: 0, polarizer: "off", analyzer: "off", pol_angle_deg: 90, extinction: 1e-4,
    fit_model: "auto", images: "recorded", windowing: "off", q_min: null, q_max: null, seed: 1,
    x_noise: "on", x_depth: "on", x_expo: "on", x_outliers: "on", x_floor: "on", x_window: "on"
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
  // settling: gravitational length kT / (buoyant weight) of a sphere of the same volume, and the wall slow-down
  function settleHint() {
    if (state.settle !== "on") return "Particles are spread evenly through the cell and diffuse freely.";
    const g = geometry(), T = state.T_C + 273.15, kT = 1.380649e-23 * T, lam = centralWavelength();
    const rp = state.particle === "custom" ? state.rho_custom : OPTICS.particleDensity(state.particle), rl = OPTICS.liquidDensity(liquidSpec(), state.T_C);
    const F = (rp - rl) * 1000 * g.volume * 1e-18 * 9.81, lg = Math.abs(F) > 0 ? kT / Math.abs(F) * 1e6 : Infinity;
    const where = !isFinite(lg) || lg > 3 * state.cell_um ? "they stay spread through the cell" : (F > 0 ? "they collect within about " + fmtSig(lg, 2) + " " + MU + "m of the bottom" : "they float to within about " + fmtSig(lg, 2) + " " + MU + "m of the top");
    return "Densities " + rp.toFixed(2) + " (particle) and " + rl.toFixed(3) + " g/cm" + SUP3 + " (liquid): " + where + ". Near the glass the liquid has to squeeze past, so they diffuse more slowly (exact for spheres, applied to the hydrodynamic radius for other shapes); the true value shown is the average along the image plane.";
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
    return {
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
      drift_um_s: state.drift_um_s, gravity: state.settle === "on", walls: state.settle === "on", vector: useVector()
    };
  }
  function analysisOptions() {
    return { fit_model: fitModel(), q_min_per_um: state.q_min, q_max_per_um: state.q_max, images: state.images, windowing: state.windowing === "on",
      // what this page adds to the published method, each switchable at the "Addict" level, where the published
      // method alone also runs on the same movie for comparison
      noise: state.x_noise === "off" ? "fit" : undefined, depth: state.x_depth !== "off", exposure: state.x_expo !== "off",
      outliers: state.x_outliers !== "off", var_floor: state.x_floor !== "off", window_fix: state.x_window !== "off", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const BODY = function () { return state.shape === "prolate" || state.shape === "oblate" || state.shape === "rod"; };
  const TURNS = function () { return state.shape !== "sphere"; };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "shape", group: "Sample", lvl: 1, label: "Shape", kind: "select", options: function () { return Object.keys(SHAPES).filter(function (k) { return state.mode !== "dic" || k === "sphere"; }).map(function (k) { return [k, SHAPES[k]]; }); }, hint: function () { return state.mode === "dic" ? "DIC is simulated for spheres only." : shapeHint(); } },
    { key: "particle", group: "Sample", lvl: 1, label: "Material", kind: "select", options: function () { return SHAPE_MATERIALS[state.shape].map(function (k) { return [k, MATERIALS[k]]; }); } },
    { key: "n_custom", group: "Sample", lvl: 1, label: function () { return state.shape === "bisphere" ? "Ordinary refractive index (n_o)" : "Particle refractive index"; }, kind: "lin", min: 1.3, max: 2.6, step: 0.01, fmt: function (v) { return v.toFixed(2); }, when: function () { return state.particle === "custom"; } },
    { key: "diameter_um", group: "Sample", lvl: 1, label: function () { return SIZE_LABEL[state.shape]; }, kind: "log", min: 0.03, max: 5, fmt: fmtSize },
    { key: "aspect", group: "Sample", lvl: 1, label: function () { return ASPECT_LABEL[state.shape] || "Aspect ratio"; }, kind: "log", min: 1.2, max: 20, fmt: function (v) { return fmtSig(Math.max(state.shape === "rod" ? 2 : 1, v), 2); }, when: BODY, hint: function () { return state.shape === "rod" && state.aspect < 2 ? "Rods are simulated from aspect ratio 2 (the friction formulas hold from there)." : ""; } },
    { key: "dn", group: "Sample", lvl: 2, label: "Birefringence (n_e - n_o)", kind: "lin", min: -0.2, max: 0.2, step: 0.01, fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2); }, when: function () { return state.shape === "bisphere" && TRANS(); }, hint: function () { return state.particle === "mfa" ? "Hyflon MFA: partly crystalline, so weakly birefringent; no published value found, 0.02 is an assumption (crystalline PTFE colloids show about 0.04). The sign does not change the dynamics." : "Optic axis fixed in the particle. A uniform axis is assumed; liquid-crystal droplets have a director field that lowers the effective value."; } },
    { key: "dn_body", group: "Sample", lvl: 3, label: "Birefringence of the material (n_e - n_o)", kind: "lin", min: -0.2, max: 0.2, step: 0.01, fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2); }, when: function () { return BODY() && TRANS(); }, hint: "Optic axis along the symmetry axis. The shape adds its own (form) birefringence even at zero." },
    { key: "phi", group: "Sample", lvl: 2, label: "Concentration (volume fraction)", kind: "log", min: 1e-6, max: 1e-2, fmt: fmtPhi, hint: function () { return particleCount() + " particles in the simulated volume." + (phiCapped ? " Lowered to fit what the browser can follow (" + MAX_PARTICLES + " particles even in the smallest simulated field)." : "") + (phiRaised ? " Raised so that a few particles are in the simulated field." : ""); } },
    { key: "size_spread", group: "Sample", lvl: 2, label: "Spread of sizes (relative standard deviation)", kind: "lin", min: 0, max: 0.5, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, hint: function () { return state.size_spread > 0 ? "Simulated as five sizes with the chosen distribution (same mean and spread). The sizes measured are weighted by how strongly each one shows in the images." : ""; } },
    { key: "size_dist", group: "Sample", lvl: 2, label: "Size distribution", kind: "select", options: [["schulz", "Schulz (gamma), the usual model in light scattering"], ["lognormal", "Log-normal"]], when: function () { return state.size_spread > 0; } },
    { key: "liquid", group: "Sample", lvl: 2, label: "Liquid", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", group: "Sample", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; } },
    { key: "n_liquid", group: "Sample", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", group: "Sample", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", group: "Sample", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", group: "Sample", lvl: 2, label: "Cell thickness", kind: "log", min: 1, max: 500, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return particleCount() > 30000 ? "Too many particles for the browser (" + particleCount() + "): lower the concentration or simulate a smaller part of the image." : state.mode === "dic" && state.cell_um >= 200 ? "DIC is simulated in cells up to 200 " + MU + "m." : state.cell_um > 60 ? "Thick cells take longer to simulate (up to about 20 s): far from focus each particle's image changes with depth in many ways." : ""; } },
    { key: "focus_frac", group: "Sample", lvl: 2, label: "Focus height in the cell", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },
    { key: "settle", group: "Sample", lvl: 2, label: "Gravity and walls", kind: "select", options: [["off", "Off: free diffusion in the whole cell"], ["on", "On: particles settle and slow down near the glass"]], hint: settleHint },
    { key: "rho_custom", group: "Sample", lvl: 3, label: "Particle density", kind: "lin", min: 0.8, max: 4, step: 0.01, fmt: function (v) { return v.toFixed(2) + " g/cm" + SUP3; }, when: function () { return state.particle === "custom" && state.settle === "on"; } },
    { key: "rho_liquid", group: "Sample", lvl: 3, label: "Liquid density", kind: "lin", min: 0.7, max: 2, step: 0.01, fmt: function (v) { return v.toFixed(2) + " g/cm" + SUP3; }, when: function () { return state.liquid === "custom" && state.settle === "on"; } },
    { key: "drift_um_s", group: "Sample", lvl: 3, label: "Drift (flow to the right)", kind: "lin", min: 0, max: 5, step: 0.1, fmt: function (v) { return v.toFixed(1) + " " + MU + "m/s"; } },

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
    { key: "polarizer", group: "Illumination", lvl: 1, label: "Polarizer before the sample", kind: "select", options: [["off", "None"], ["on", "Linear polarizer"]], when: function () { return TRANS() && state.mode !== "dic"; }, hint: function () { return state.polarizer === "on" ? "Light polarized along x." + (state.analyzer !== "on" ? " Without an analyzer, anisotropic particles look brighter or darker as they turn." : "") : TURNS() && state.analyzer !== "on" ? "Turning particles show best between polarizers (birefringent ones) or in dark field." : ""; } },
    { key: "analyzer", group: "Detection", lvl: 1, label: "Analyzer after the sample", kind: "select", options: [["off", "None"], ["on", "Linear polarizer (analyzer)"]], when: function () { return TRANS() && state.mode !== "dic"; }, hint: polHint },
    { key: "pol_angle_deg", group: "Detection", lvl: 1, label: "Angle between polarizer and analyzer", kind: "lin", min: 0, max: 90, step: 1, fmt: function (v) { return Math.round(v) + DEG + (Math.round(v) === 90 ? " (crossed)" : Math.round(v) === 0 ? " (parallel)" : ""); }, when: function () { return TRANS() && state.mode !== "dic" && state.polarizer === "on" && state.analyzer === "on"; } },
    { key: "extinction", group: "Detection", lvl: 3, label: "Polarizer leak (light passing crossed polarizers)", kind: "log", min: 1e-6, max: 1e-2, fmt: fmtPhi, when: function () { return TRANS() && state.mode !== "dic" && state.polarizer === "on" && state.analyzer === "on"; }, hint: "Real pairs in a microscope pass about 1e-4 to 1e-3 of the light when crossed." },
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
      hint: function () { return BURSTS() ? "The same frames cover " + fmtDur(movieSpanS()) + " instead of " + fmtDur(Math.min(state.n_frames, maxFrames(simPx())) / state.frame_rate_hz) + ". In each cycle the first frames follow at the frame rate, then the gaps grow by a fixed factor; the cycle repeats. Slow and fast particles then fit in one movie." : "All frames one frame interval apart: " + fmtDur(Math.min(state.n_frames, maxFrames(simPx())) / state.frame_rate_hz) + " of movie."; } },
    { key: "log_factor", group: "Camera and recording", lvl: 2, label: "Log-spaced: how much longer the movie lasts", kind: "select", num: true, when: function () { return state.frame_timing === "log"; },
      options: function () { return [5, 10, 20, 50].map(function (k) { return [k, k + " times (" + fmtDur(movieSpanS(k)) + ")"]; }); } },
    { key: "sim_px", group: "Camera and recording", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]] },

    { key: "fit_model", group: "Analysis", lvl: 2, label: "Fit at each q (sets the headline size)", kind: "select", options: [["auto", "Automatic: simple exponential, or modes for particles that turn"], ["simple", "Simple exponential (identical particles)"], ["schulz", "Schulz distribution of rates (mixed sizes)"], ["stretched", "Stretched exponential"], ["two", "Two modes: translation, translation + rotation"], ["three", "Three modes: adds 20 D_R (crossed polarizers)"]], hint: "Cumulants (as in DLS) and a Schulz fit are always computed too and shown next to the headline, so the methods can be compared. Repeatability and the other checks use the fit chosen here." },
    { key: "windowing", group: "Analysis", lvl: 2, label: "Windowing (Giavazzi et al. 2017)", kind: "select", options: [["off", "Off"], ["on", "On: each frame multiplied by a window that falls to zero at the edges"]],
      hint: function () { return state.windowing === "on" ? "Cells or particles that cross the edge of the image no longer leave bands along the axes of the map in step 4, nor a fast decay that swamps the finest patterns. The price: the window darkens the edges, so less of the field counts and the results scatter more, and patterns wider than a fifth of the field are left out (the window mixes each pattern with its neighbours)." : "The Fourier transform treats the image as one tile of a repeating pattern, so cells or particles crossing the edges make jumps at the tile borders. The central cross of the map is left out to remove most of their effect."; } },
    { key: "images", group: "Analysis", lvl: 2, label: "Images analysed", kind: "select", options: [["recorded", "As recorded"], ["squared_gradient", "Squared gradient of each frame (SG-DDM)"]], hint: function () { return state.images === "squared_gradient" ? "Squaring turns changes of shape into changes of brightness, so rotations show up in bright field (Giavazzi, Pal and Cerbino 2021)." : ""; } },
    { key: "qrange", group: "Analysis", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // where each control sits: the imaging mode, then everything about the sample, the light reaching it, and how the
  // "Addict": the additions to the published method, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_noise", lvl: 4, label: "Camera noise known from the detector", kind: "select", options: ONOFF("B fitted at each q"),
      hint: function () { return "On: B = 2 (excess-noise factor x mean count + read noise\u00b2), the same at every q, with the two checks that come with it. Off: B fitted at each q, as in the published method."; } },
    { key: "x_depth", lvl: 4, label: "Depth of field in the fit", kind: "select", options: ONOFF("only sideways motion"),
      hint: function () { return "On: particles that diffuse up or down also fade from each pattern, through the optics of step 1. Off: f = exp(-\u0393\u0394t) as published."; } },
    { key: "x_expo", lvl: 4, label: "Exposure time in the fit", kind: "select", options: ONOFF("frames taken as instants"),
      hint: function () { return "On: each frame averages the image over the exposure, and the fit allows for it. Matters when the exposure is not short compared with 1/\u0393."; } },
    { key: "x_outliers", lvl: 4, label: "Outlier rule", kind: "select", options: ONOFF("every q that passes the other tests counts"),
      hint: function () { return "On: a q whose \u0393/q\u00b2 lies more than 3 times away from the median of the others is left out."; } },
    { key: "x_floor", lvl: 4, label: "Floor on the weights", kind: "select", options: ONOFF("plain inverse-variance weights"),
      hint: function () { return "On: in the mean of \u0393/q\u00b2 no variance is taken below a quarter of the median one, so a few rates with error bars small by chance do not set the result."; } },
    { key: "x_window", lvl: 4, label: "Window corrections", kind: "select", options: ONOFF("the window as in the paper"), when: function () { return state.windowing === "on"; },
      hint: function () { return "On: the rates are compared with D(q\u00b2 + 1.21 (2\u03c0/L)\u00b2) and patterns below 5 steps in q are left out, because the window mixes neighbouring patterns. Off: D q\u00b2, and only patterns below 2 steps left out."; } }
  );

  // light is collected and recorded. Every control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Imaging mode", ["mode"]],
    ["Sample", ["shape", "particle", "n_custom", "diameter_um", "aspect", "dn", "dn_body", "size_spread", "size_dist", "phi", "dye", "liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "rho_liquid", "T_C", "cell_um", "settle", "rho_custom", "drift_um_s"]],
    ["Illumination", ["source", "condenser", "na_c", "df_kind", "annulus", "polarizer", "light_frac", "df_light_e", "stray_frac", "rate_ph_ms", "bg_e_ms", "scan_rate"]],
    ["Detection", ["objective", "optics", "focus_frac", "ring_T", "dic_bias_deg", "dic_shear_um", "dic_angle_deg", "analyzer", "pol_angle_deg", "extinction",
      "scanner", "scan_px", "zoom", "line_avg", "pinhole_au", "camera", "cam_mode", "iface", "roi", "binning", "frame_rate_hz", "exposure_ms", "n_frames", "frame_timing", "log_factor", "sim_px"]],
    ["Analysis", ["images", "windowing", "fit_model", "qrange"]],
    ["Addict: what this page adds", ["x_noise", "x_depth", "x_expo", "x_outliers", "x_floor", "x_window"]]
  ];
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; out.push(c); delete byKey[k]; }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { fit_model: 1, q_min: 1, q_max: 1, images: 1, windowing: 1, x_noise: 1, x_depth: 1, x_expo: 1, x_outliers: 1, x_floor: 1, x_window: 1 };
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
    if (Math.abs(ni - nl) > 1e-3 && dF > 0) parts.push("Immersion index " + ni.toFixed(3) + ", liquid " + nl.toFixed(3) + ": focusing " + fmtSig(dF, 2) + " " + MU + "m into the cell adds spherical aberration (included; correction collar taken as set for a standard cover glass).");
    if (o.ph) parts.push("Phase ring " + o.ph + (objRing() ? "." : " (not simulated).") );
    return parts.join(" ");
  }

  const ctlEls = {};
  function buildControls() {
    const host = $("ctl-groups"), groups = {};
    CONTROLS.forEach(function (c) {
      if (!groups[c.group]) {
        const g = document.createElement("div"); g.className = "cgroup";
        const h = document.createElement("h3"); h.textContent = c.group; g.appendChild(h);
        host.appendChild(g); groups[c.group] = g;
      }
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
      groups[c.group].appendChild(wrap);
      const g = groups[c.group], cur = parseInt(g.dataset.minlvl || "9", 10);
      if (c.lvl < cur) { g.dataset.minlvl = c.lvl; g.classList.remove("lvl-2", "lvl-3"); if (c.lvl === 2) g.classList.add("lvl-2"); if (c.lvl === 3) g.classList.add("lvl-3"); }
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
    if (key === "shape" && SHAPE_MATERIALS[state.shape].indexOf(state.particle) < 0) state.particle = SHAPE_MATERIALS[state.shape][0];
    // typical particles of each birefringent material (MFA: radius 90 nm; birefringence not published, value assumed)
    if ((key === "shape" || key === "particle") && state.shape === "bisphere") {
      if (state.particle === "mfa") { state.diameter_um = 0.18; state.dn = 0.02; }
      if (state.particle === "rm257") state.dn = 0.1;
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
    if (curveView === "d" && lv === "curious") setCurveView("change");
    if (fromUser && location.hash !== "#" + lv) { try { history.replaceState(null, "", "#" + lv); } catch (e) { /* sandboxed previews (about:srcdoc) refuse it */ } }
    constrain(); syncControls(); drawFov();
    // the "published method only" row is computed at the "Addict" level only
    if (changed) schedule(); else if (changedAna || (cache.res && lv === "addict" && !cache.res.published)) scheduleAnalysis(); else if (cache.res) renderAll();
  }

  // ---- running (in a background worker when the browser allows it) --------------------
  const cache = { movie: null, res: null, cfg: null, opts: null };
  let timer = null, worker = null, runToken = 0, workerOK = true;
  function workerSource() {
    return ["optics-src", "movie-src", "engine-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
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
  // repeated measurements (five new movies with the same settings), kept until the next run
  let repeat = null, lastRunS = null, runStart = 0;
  function repeatRun(sm) {
    if (!sm.main_D) return null;
    const tr = sm.truth, fw = wallFactor(tr), used = sm.qs.map(function (q) { return { q_per_um: q }; });
    return { main_d: sizeFromD(sm.main_D), cum_d: sm.cum_D ? sizeFromD(sm.cum_D) : null, cum_pi: sm.cum_pi, sch_pi: sm.sch_pi, true_d: (cache.cfg.size_spread > 0 ? seenDiameter(tr, { used: used }) : tr.diameter_um) / fw };
  }
  function startRepeat() {
    if (!cache.res || (repeat && !repeat.done)) return;
    const token = runToken, cfg = cache.cfg, opts = cache.opts, base = (cfg.seed || 1) * 1000;
    const seeds = [1, 2, 3, 4, 5].map(function (k) { return base + k; });
    repeat = { runs: [], done: false, token: token };
    renderResult(); progress(0, "Repeating: movie 1 of 5");
    const got = function (sm) { if (token !== runToken || !repeat || repeat.token !== token) return; const r = repeatRun(sm); if (r) repeat.runs.push(r); renderResult(); };
    const end = function () { if (token !== runToken || !repeat) return; repeat.done = true; $("bar").style.width = "100%"; $("status").textContent = "Done. Five repeated movies analysed."; idle(); renderResult(); };
    if (worker) {
      worker.onmessage = function (ev) {
        const m = ev.data; if (m.token !== runToken) return;
        if (m.type === "progress") progress(m.frac, "Repeating: " + m.stage.toLowerCase() + " (movie " + Math.min(5, 1 + Math.floor(m.frac * 5)) + " of 5)");
        else if (m.type === "repeat-run") got(m.run);
        else if (m.type === "repeat-done") end();
        else if (m.type === "error") { repeat = null; showError(m.message); }
      };
      worker.postMessage({ type: "repeat", token: token, cfg: cfg, opts: opts, seeds: seeds });
    } else {
      (async function () {
        for (let k = 0; k < seeds.length; k++) {
          const mv = await drive(MOVIE.simulate(Object.assign({}, cfg, { seed: seeds[k] })), token, k / 5, (k + 0.85) / 5); if (!mv) return;
          const r = await drive(DDM.analyse(mv, opts), token, (k + 0.85) / 5, (k + 1) / 5); if (!r) return;
          got(DDM.repeatSummary(r, mv));
        }
        end();
      })();
    }
  }
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
    const res = await drive(DDM.analyse(movie, opts), token, 0.85, opts.compare_published ? 0.93 : 1);
    if (!res) return;
    if (opts.compare_published) { const rp = await drive(DDM.analyse(movie, Object.assign({}, opts, { published_only: true, jackknife: false })), token, 0.93, 1); if (!rp) return; res.published = DDM.publishedSummary(rp); }
    inflight = null;
    res.fits.forEach(function (f) { delete f.model; });
    finish(movie, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  function finish(movie, res, cfg, opts) {
    if (runStart) { const s = (performance.now() - runStart) / 1000; if (movie !== cache.movie) lastRunS = s; }
    repeat = null;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    res.used = res.fits.filter(function (f) { return f.reason === null; });
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames of " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " particles."; idle();
    frameIdx = 0;
    renderAll();
  }
  function modelAt(f, t) {
    if (f.two) return f.A * (1 - f.frac_slow * Math.exp(-f.gamma_hz * t) - (1 - f.frac_slow) * Math.exp(-f.gamma2_hz * t)) + f.B;
    return f.A * (1 - Math.exp(-Math.pow(f.gamma_hz * t, f.beta))) + f.B;
  }

  // ---- colours ---------------------------------------------------------------------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ["ink", "muted", "rule", "accent", "accent-2", "tint", "paper", "good", "warn", "bad"].forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim(); });
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
  function pickDefaultSelection() {
    const res = cache.res, n = cache.movie.n, pool = res.used.length ? res.used : res.fits;
    const f = pool[Math.floor(pool.length / 2)], b = f.bin;
    if (!sel || Math.hypot(sel.kx, sel.ky) > n / 2) sel = { kx: Math.max(1, Math.round(b * Math.cos(0.5))), ky: Math.max(1, Math.round(b * Math.sin(0.5))) };
  }
  function selBin() { return Math.round(Math.hypot(sel.kx, sel.ky)); }
  function drawMap() {
    const res = cache.res, n = cache.movie.n, map = res.d2d[lagIndex()];
    const c = $("map"); if (c.width !== n) { c.width = n; c.height = n; }
    const vals = []; for (let p = 1; p < n * n; p++) if (map[p] > 0) vals.push(Math.log10(map[p]));
    vals.sort(function (a, b) { return a - b; });
    const lo = vals[Math.floor(0.02 * vals.length)], hi = vals[Math.floor(0.999 * vals.length)];
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let Y = 0; Y < n; Y++) for (let X = 0; X < n; X++) {
      const kx = X - n / 2, ky = n / 2 - Y, ix = (kx + n) % n, iy = (ky + n) % n, v = map[iy * n + ix];
      const col = magma(v > 0 ? (Math.log10(v) - lo) / (hi - lo) : 0), p = 4 * (Y * n + X);
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    drawMapOverlay();
  }
  function drawMapOverlay() {
    const ov = $("map-ov"), n = cache.movie.n, S = ov.width, s = S / n;
    const ctx = ov.getContext("2d"); ctx.clearRect(0, 0, S, S);
    const cx = S / 2 + 0.5 * s, cy = S / 2 + 0.5 * s;
    const kopt = cache.res.window.q_opt_per_um * cache.movie.L_um / (2 * Math.PI);
    ctx.lineWidth = 2;
    if (level !== "curious" && kopt < n / 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, kopt * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    const r = Math.hypot(sel.kx, sel.ky) * s;
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    const px = cx + sel.kx * s, py = cy - sel.ky * s;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(2 * cx - px, 2 * cy - py, 6, 0, 2 * Math.PI); ctx.stroke();
  }
  function drawStripes() {
    const n = cache.movie.n, c = $("stripes"); if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 128 + 110 * Math.cos(2 * Math.PI * (sel.kx * x + sel.ky * (n - 1 - y)) / n), p = 4 * (y * n + x); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = Math.hypot(sel.kx, sel.ky), q = 2 * Math.PI * k / cache.movie.L_um, spacing = cache.movie.L_um / k, ang = Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI);
    const f = cache.res.fits.find(function (ff) { return ff.bin === selBin(); });
    let txt = "Stripe spacing <b>" + fmtSig(spacing, 2) + " " + MU + "m</b>";
    if (level !== "curious") txt += ", q = <b>" + q.toFixed(2) + " " + MU + "m<sup>-1</sup></b>, direction " + ang + "&deg;";
    if (f && f.reason === null) txt += ". This pattern renews in about <b>" + fmtTime(1 / f.gamma_hz) + "</b>; it is the thick curve in step 5" + (level !== "curious" ? ", the ring at q = " + f.q_per_um.toFixed(2) + " that contains it" : "") + ".";
    else if (f) txt += ". Not used: " + f.reason + ".";
    $("pick-out").innerHTML = txt;
  }
  function onMapClick(ev) {
    if (!cache.res) return;
    const ov = $("map-ov"), rect = ov.getBoundingClientRect(), n = cache.movie.n;
    const X = Math.floor((ev.clientX - rect.left) / rect.width * n), Y = Math.floor((ev.clientY - rect.top) / rect.height * n);
    const kx = X - n / 2, ky = n / 2 - Y; if (kx === 0 && ky === 0) return;
    sel = { kx: kx, ky: ky }; drawMapOverlay(); drawStripes(); drawCurves();
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

  let curveView = "change", qSpan = null;
  function setCurveView(v) { curveView = v; $("view-change").setAttribute("aria-pressed", v === "change"); $("view-d").setAttribute("aria-pressed", v === "d"); if (cache.res) drawCurves(); }
  function setQSpan() { const u = cache.res.used.length >= 2 ? cache.res.used : cache.res.fits.filter(function (f) { return f.ok; }); qSpan = [u[0].q_per_um, u[u.length - 1].q_per_um]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }
  function drawCurves() {
    const res = cache.res, taus = res.taus_s;
    const pool = res.used.length >= 2 ? res.used : res.fits.filter(function (f) { return f.ok && f.q_per_um <= res.window.q_hi_per_um && f.q_per_um >= 2 * res.window.q_lo_per_um; });
    const pick = [], k = Math.min(7, pool.length);
    for (let i = 0; i < k; i++) pick.push(pool[Math.round(i * (pool.length - 1) / Math.max(1, k - 1))]);
    const selF = res.fits.find(function (f) { return f.bin === selBin(); });
    if (selF && pick.indexOf(selF) < 0 && selF.ok) pick.push(selF);
    const x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    let o;
    if (curveView === "change") o = { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.15, y1: 1.25, xlabel: "Delay (s)", ylabel: level === "curious" ? "How much has changed" : "1 \u2212 f(q, \u0394t)" };
    else {
      let lo = Infinity, hi = 0;
      pick.forEach(function (f) { res.dq.forEach(function (row) { const v = row[f.bin]; if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
      o = { xlog: true, ylog: true, x0: x0, x1: x1, y0: lo / 1.6, y1: hi * 1.6, xlabel: "Delay \u0394t (s)", ylabel: "d(q, \u0394t)" };
    }
    const a = axes($("chart-curves"), o), ctx = a.ctx;
    pick.forEach(function (f) {
      const isSel = f === selF, col = qColor(qPos(f.q_per_um));
      const tr = function (v) { return curveView === "change" ? (v - f.B) / f.A : v; };
      ctx.strokeStyle = col; ctx.lineWidth = isSel ? 3 : 1.5; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const t = x0 * Math.pow(x1 / x0, i / 120), v = tr(modelAt(f, t)); if (curveView === "d" && !(v > 0)) continue; const X = a.fx(t), Y = a.fy(v); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
      ctx.stroke();
      res.dq.forEach(function (row, li) { const v = tr(row[f.bin]); if (curveView === "d" && !(v > 0)) return; dot(ctx, a.fx(taus[li]), a.fy(v), isSel ? 3.2 : 2.4, col, null); });
    });
    a.done();
    const leg = $("curves-legend"); leg.innerHTML = "";
    pick.forEach(function (f) { const s = document.createElement("span"); s.innerHTML = '<i style="background:' + qColor(qPos(f.q_per_um)) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / f.q_per_um, 2) + " " + MU + "m" : "q = " + f.q_per_um.toFixed(2)) + (f === selF ? " (picked)" : ""); leg.appendChild(s); });
    if (level !== "curious") { const s = document.createElement("span"); s.textContent = "q in " + MU + "m\u207b\u00b9"; leg.appendChild(s); }
  }
  function drawRates() {
    const res = cache.res, w = res.window;
    const ok = res.fits.filter(function (f) { return f.ok && f.gamma_hz > 0 && Number.isFinite(f.gamma_hz); });
    const x0 = res.q_per_um[1] * 0.8, x1 = res.q_per_um[res.q_per_um.length - 1] * 1.25, y0 = w.gamma_lo_hz / 8, y1 = w.gamma_hi_hz * 8;
    const a = axes($("chart-rates"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1,
      xlabel: level === "curious" ? "Finer patterns \u2192   (wave vector q, " + MU + "m\u207b\u00b9)" : "Wave vector q (" + MU + "m\u207b\u00b9)",
      ylabel: level === "curious" ? "Faster change (1/s)" : "Rate \u0393 (s\u207b\u00b9)" });
    const ctx = a.ctx;
    ctx.fillStyle = C.tint; ctx.globalAlpha = 0.9;
    const shade = function (xa, ya, xb, yb) { ctx.fillRect(a.fx(xa), a.fy(yb), a.fx(xb) - a.fx(xa), a.fy(ya) - a.fy(yb)); };
    shade(x0, y0, 2 * w.q_lo_per_um, y1); shade(w.q_hi_per_um, y0, x1, y1); shade(x0, y0, x1, w.gamma_lo_hz); shade(x0, w.gamma_hi_hz, x1, y1);
    ctx.globalAlpha = 1; ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    [[w.gamma_lo_hz, "slower than half the movie", "top", 3], [w.gamma_hi_hz, "faster than one frame", "bottom", -3]].forEach(function (hh) { const y = a.fy(hh[0]); ctx.beginPath(); ctx.moveTo(a.m.l, y); ctx.lineTo(a.m.l + a.pw, y); ctx.stroke(); ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = hh[2]; ctx.fillText(hh[1], a.m.l + 6, y + hh[3]); });
    const xq = a.fx(w.q_hi_per_um); ctx.beginPath(); ctx.moveTo(xq, a.m.t); ctx.lineTo(xq, a.m.t + a.ph); ctx.stroke();
    ctx.save(); ctx.translate(xq - 4, a.m.t + 6); ctx.rotate(-Math.PI / 2); ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(w.q_opt_per_um <= w.q_nyq_per_um ? "optical limit" : "pixel limit", 0, 0); ctx.restore();
    ctx.setLineDash([]);
    if (res.D) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.fx(x0), a.fy(res.D.D_um2_s * x0 * x0)); ctx.lineTo(a.fx(x1), a.fy(res.D.D_um2_s * x1 * x1)); ctx.stroke();
      if (LEVEL_RANK[level] >= 3 && res.slope) { ctx.setLineDash([2, 3]); ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(a.fx(x0), a.fy(res.slope.prefactor * Math.pow(x0, res.slope.exponent))); ctx.lineTo(a.fx(x1), a.fy(res.slope.prefactor * Math.pow(x1, res.slope.exponent))); ctx.stroke(); ctx.setLineDash([]); }
    }
    // what pure diffusion of the true particles would give (known here because the movie is simulated)
    if (level !== "curious") {
      const Dt = trueD(cache.movie.truth);
      ctx.setLineDash([7, 4]); ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(a.fx(x0), a.fy(Dt * x0 * x0)); ctx.lineTo(a.fx(x1), a.fy(Dt * x1 * x1)); ctx.stroke(); ctx.setLineDash([]);
    }
    // two modes: the fast mode (translation + rotation) as squares, fitted and true lines D q^2 + 6 D_R
    const rot = res.rot && res.rot.D_r_s ? res.rot : null, trR = cache.movie.truth.D_r_s;
    if ((res.fit_model === "two" || res.fit_model === "three")) {
      if (rot && res.D) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const q = x0 * Math.pow(x1 / x0, i / 60), X = a.fx(q), Y = a.fy(res.D.D_um2_s * q * q + 6 * rot.D_r_s); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); }
      if (level !== "curious" && trR) { const Dt = trueD(cache.movie.truth); ctx.setLineDash([7, 4]); ctx.strokeStyle = C["accent-2"]; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const q = x0 * Math.pow(x1 / x0, i / 60), X = a.fx(q), Y = a.fy(Dt * q * q + 6 * trR); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); ctx.setLineDash([]); }
      ok.forEach(function (f) { if (!f.two) return; const X = a.fx(f.q_per_um), Y = a.fy(f.gamma2_hz), r = 3.2, col = qColor(qPos(f.q_per_um)); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(X - r, Y - r, 2 * r, 2 * r); });
    }
    ok.forEach(function (f) { const X = a.fx(f.q_per_um), Y = a.fy(f.gamma_hz); if (f.reason === null) dot(ctx, X, Y, 3.6, qColor(qPos(f.q_per_um)), null); else dot(ctx, X, Y, 3, null, C.muted); });
    if (sel) { const f = res.fits.find(function (ff) { return ff.bin === selBin(); }); if (f && f.ok) dot(ctx, a.fx(f.q_per_um), a.fy(f.gamma_hz), 7, null, C.ink); }
    a.done();
    const counts = {}; res.fits.forEach(function (f) { if (f.reason) counts[f.reason] = (counts[f.reason] || 0) + 1; });
    const ul = $("reasons"); ul.innerHTML = "";
    if (level !== "curious") { const lt = document.createElement("li"); lt.textContent = "Dashed red line: D q\u00b2 for the true particles, what pure diffusion would give. Points above it at small q come from particles leaving the focal plane (most visible in confocal modes)."; ul.appendChild(lt); }
    if ((res.fit_model === "two" || res.fit_model === "three")) {
      const lt2 = document.createElement("li");
      lt2.textContent = "Two modes were fitted. Dots: the slow mode (translation only). Squares: the fast mode, where the particles also turn; it sits about 6 D_R above the dots and flattens at small q." +
        (res.rot && res.rot.D_r_s ? " The upper black line is D q\u00b2 + 6 D_R from a joint fit of all q." + (res.fit_model === "three" ? " Three modes were fitted: between crossed polarizers the light also carries a faster orientation mode, 20 D_R, which the squares (two modes per q) mix in." : "") : " No clear rotational mode was found" + (res.rot && res.rot.reason ? " (" + res.rot.reason + ")." : "."));
      ul.appendChild(lt2);
    }
    const li0 = document.createElement("li"); li0.textContent = res.used.length + " points used" + (res.D ? " for the black line of slope 2" : "") + (LEVEL_RANK[level] >= 3 && res.slope ? "; free fit gives slope " + res.slope.exponent.toFixed(2) + " (dotted)" : "") + "."; ul.appendChild(li0);
    Object.keys(counts).sort(function (p, q) { return counts[q] - counts[p]; }).forEach(function (k) { const li = document.createElement("li"); li.textContent = counts[k] + " left out: " + k + "."; ul.appendChild(li); });
  }
  // apparent size at each q: Stokes-Einstein applied to Gamma / q^2 of that q alone (points, with the fit error),
  // the measured size (black), cumulant sizes (open squares) and, for the simulated sample, what each q should give
  function drawSize() {
    if (level === "curious" || !$("chart-size")) return;
    const res = cache.res, tr = cache.movie.truth, fw = wallFactor(tr);
    const pts = res.fits.filter(function (f) { return f.ok && f.gamma_hz > 0 && f.reason === null; });
    if (pts.length < 2) { axes($("chart-size"), { xlog: true, ylog: false, x0: 0.1, x1: 10, y0: 0, y1: 1, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "Apparent size (nm)" }).done(); return; }
    const sz = function (f) { return 1000 * sizeFromD(f.gamma_hz / (f.q_per_um * f.q_per_um)); };
    const vals = pts.map(sz), cu = res.cumulants && res.cumulants.per_q ? res.cumulants.per_q : [];
    cu.forEach(function (e) { vals.push(1000 * sizeFromD(e.gamma_hz / (e.q_per_um * e.q_per_um))); });
    const trueAt = function (q) { return 1000 * sizeFromD(seenAt(tr, q).D * fw); };
    pts.forEach(function (f) { vals.push(trueAt(f.q_per_um)); });
    vals.sort(function (a, b) { return a - b; });
    const lo = vals[Math.floor(0.05 * (vals.length - 1))], hi = vals[Math.ceil(0.95 * (vals.length - 1))], pad = Math.max(0.15 * (hi - lo), 0.1 * hi);
    const q0 = pts[0].q_per_um / 1.3, q1 = pts[pts.length - 1].q_per_um * 1.3;
    const a = axes($("chart-size"), { xlog: true, ylog: false, x0: q0, x1: q1, y0: Math.max(0, lo - pad), y1: hi + pad, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "Apparent size (nm)" }), ctx = a.ctx;
    ctx.setLineDash([7, 4]); ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const q = q0 * Math.pow(q1 / q0, i / 60), X = a.fx(q), Y = a.fy(trueAt(q)); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (res.diameter_um) { const Y = a.fy(1000 * res.diameter_um); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.m.l, Y); ctx.lineTo(a.m.l + a.pw, Y); ctx.stroke(); }
    pts.forEach(function (f) {
      const X = a.fx(f.q_per_um), d = sz(f), e = f.lnGamma_se, col = qColor(qPos(f.q_per_um));
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(d * Math.exp(-e))); ctx.lineTo(X, a.fy(d * Math.exp(e))); ctx.stroke();
      dot(ctx, X, a.fy(d), 3.2, col, null);
    });
    cu.forEach(function (e) { const X = a.fx(e.q_per_um), Y = a.fy(1000 * sizeFromD(e.gamma_hz / (e.q_per_um * e.q_per_um))), r = 3; ctx.strokeStyle = C.muted; ctx.lineWidth = 1.2; ctx.strokeRect(X - r, Y - r, 2 * r, 2 * r); });
    a.done();
  }
  // A(q) and B(q): fitted values (dots: filled where the point is used) and the fastDDM-style
  // estimates from the data (lines: B from the zero-delay intercept, A = 2 var - B). The axis range
  // comes from the measurable window, so runaway fits outside it (curves that never level off) cannot
  // squash the plot; such points are drawn at the edge.
  function drawAmp() {
    if (level !== "researcher") return;
    const res = cache.res, w = res.window;
    const inWin = function (q) { return q >= 2 * w.q_lo_per_um && q <= w.q_hi_per_um; };
    const vals = [];
    res.fits.forEach(function (f) { if (!inWin(f.q_per_um)) return; const b = f.bin; [res.A_est[b], res.B_est[b]].forEach(function (v) { if (v > 0 && Number.isFinite(v)) vals.push(v); }); if (f.reason === null) { if (f.A > 0) vals.push(f.A); if (f.B > 0) vals.push(f.B); } });
    if (vals.length < 2) return;
    vals.sort(function (p, q) { return p - q; });
    const y0 = vals[0] / 2.5, y1 = vals[vals.length - 1] * 2.5;
    const x0 = res.q_per_um[1] * 0.8, x1 = res.q_per_um[res.q_per_um.length - 1] * 1.25;
    const a = axes($("chart-amp"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "A(q), B(q)" });
    const ctx = a.ctx, clampY = function (v) { return Math.min(y1 / 1.05, Math.max(y0 * 1.05, v)); };
    // estimates as lines
    const line = function (arr, col, dash) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); let on = false;
      for (let b = 1; b < res.q_per_um.length; b++) { const v = arr[b]; if (!(v > 0)) { on = false; continue; } const X = a.fx(res.q_per_um[b]), Y = a.fy(clampY(v)); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    line(res.A_est, C.accent, []);
    line(res.B_est, C.muted, [5, 4]);
    res.fits.forEach(function (f) {
      if (!f.ok) return;
      const X = a.fx(f.q_per_um), used = f.reason === null;
      if (f.A > 0) { const v = f.A, out = v > y1 || v < y0; dot(ctx, X, a.fy(clampY(v)), used ? 3 : 2.4, used && !out ? C.accent : null, C.accent); }
      if (f.B > 0) { dot(ctx, X, a.fy(clampY(f.B)), used ? 2.6 : 2, used ? C.muted : null, C.muted); }
    });
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; const xq = a.fx(w.q_opt_per_um); ctx.beginPath(); ctx.moveTo(xq, a.m.t); ctx.lineTo(xq, a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]);
    a.done();
    $("amp-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>A: fit (dots), 2 var - B from the data (line)</span><span><i style="background:' + C.muted + '"></i>' + (res.noise_B ? 'B: camera noise from the mean count (dashed), the same at every q' : 'B: fit (dots), zero-delay intercept (dashed)') + '</span><span>Hollow: point not used. Points beyond the axis are drawn at its edge.</span>';
  }

  // ---- result -------------------------------------------------------------------------------
  // truth at one q for the simulated sample: signal-weighted mean D and polydispersity index <D^2>/<D>^2 - 1
  function seenAt(tr, q) {
    const T = tr.seen_table;
    if (!T) return { D: tr.D_um2_s, pi: 0 };
    const t = q / T.q_per_um[1], i = Math.min(T.q_per_um.length - 2, Math.floor(t)), g = t - i;
    let ws = 0, w1 = 0, w2 = 0;
    T.w.forEach(function (row, c) { const w = row[i] + g * (row[i + 1] - row[i]), D = T.D_um2_s[c]; ws += w; w1 += w * D; w2 += w * D * D; });
    if (!(ws > 0)) return { D: tr.D_seen_um2_s, pi: 0 };
    const m = w1 / ws; return { D: m, pi: Math.max(0, (w2 / ws) / (m * m) - 1) };
  }
  // true mean D and PI averaged over a set of q (the points the analysis used)
  function seenOver(tr, qs) {
    if (!qs.length) return { D: tr.D_seen_um2_s || tr.D_um2_s, pi: 0 };
    let d = 0, p = 0; qs.forEach(function (q) { const e = seenAt(tr, q); d += e.D; p += e.pi; });
    return { D: d / qs.length, pi: p / qs.length };
  }
  function sizeFromD(D) { const mv = cache.movie, kT = 1.380649e-23 * (mv.T_C + 273.15); return kT / (3 * Math.PI * mv.viscosity_Pa_s * D * 1e-12) * 1e6; }
  // in-plane slow-down from the walls, averaged over where the particles are (1 without walls)
  function wallFactor(tr) { return tr.walls && tr.D_plane_um2_s > 0 ? tr.D_plane_um2_s / tr.D_um2_s : 1; }
  function trueD(tr) { return (cache.cfg.size_spread > 0 ? tr.D_seen_um2_s * tr.diameter_seen_um / seenDiameter(tr, cache.res) : tr.D_um2_s) * wallFactor(tr); }
  // with a spread of sizes: the signal-weighted size over the q actually used (each q weighs the sizes by how
  // brightly they scatter there); falls back to the single weighting at a mid q
  function seenDiameter(tr, res) {
    const T = tr.seen_table, used = res.used || [];
    if (!T || used.length === 0) return tr.diameter_seen_um;
    let s = 0, n = 0;
    used.forEach(function (f) {
      const t = f.q_per_um / T.q_per_um[1], i = Math.min(T.q_per_um.length - 2, Math.floor(t)), g = t - i;
      let ws = 0, wd = 0;
      T.w.forEach(function (row, c) { const w = row[i] + g * (row[i + 1] - row[i]); ws += w; wd += w * T.D_um2_s[c]; });
      if (ws > 0) { s += wd / ws; n++; }
    });
    if (n === 0) return tr.diameter_seen_um;
    return tr.diameter_seen_um * tr.D_seen_um2_s / (s / n);
  }
  // when the measured size is too small and the in-focus layer is thin: say that axial motion speeds up the decay
  function axialNote(res, v) {
    if (!res.D || !(v.dev < -0.1) || state.drift_um_s > 0) return "";
    const lam = centralWavelength(), nl = nLiquid(lam), naEff = Math.min(objective().na, nl);
    const dz = lam * nl / (naEff * naEff), q = res.used && res.used.length ? Math.min.apply(null, res.used.map(function (f) { return f.q_per_um; })) : null;
    if (q === null || q * dz > 3) return "";
    return "The layer in focus is thin (about " + fmtSig(dz, 2) + " " + MU + "m) compared with the patterns analysed (" + fmtSig(2 * Math.PI / q, 2) + " " + MU + "m and below): particles move out of it up and down faster than they move sideways over a pattern, so the patterns fade faster than diffusion alone and the size comes out small. Larger fields (lower q), a lower NA or a thinner cell reduce this.";
  }
  function verdict() {
    const res = cache.res, tr = cache.movie.truth;
    if (res.diameter_um === null) {
      const counts = {}; res.fits.forEach(function (f) { if (f.reason) counts[f.reason] = (counts[f.reason] || 0) + 1; });
      const top = Object.keys(counts).sort(function (p, q) { return counts[q] - counts[p]; })[0];
      return { cls: "bad", text: "Not measurable", why: "Too few usable points. Most were left out because: " + top + "." };
    }
    const fw = wallFactor(tr), target = (cache.cfg.size_spread > 0 ? seenDiameter(tr, res) : tr.diameter_um) / fw;
    const dev = res.diameter_um / target - 1, err = res.diameter_rel_err;
    if (Math.abs(dev) <= Math.max(0.05, 2 * err)) return { cls: "good", text: fw < 0.97 ? "As expected near the glass (" + Math.round(100 * (1 / fw - 1)) + " % larger)" : Math.abs(dev) <= 0.05 ? "Matches the true size (within 5 %)" : "Off by " + Math.round(100 * Math.abs(dev)) + " %, within the uncertainty of this movie", dev: dev };
    if (Math.abs(dev) <= 0.15) return { cls: "warn", text: "Off by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
    return { cls: "bad", text: "Wrong by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
  }
  function rotVerdict() {
    const r = cache.res.rot, tr = cache.movie.truth;
    if (!r || !r.D_r_s) return { cls: "bad", text: "Rotation not measured", why: r && r.reason ? "Rotation: " + r.reason + "." : "" };
    const dev = r.D_r_s / tr.D_r_s - 1;
    if (Math.abs(dev) <= Math.max(0.1, 2 * r.rel_err)) return { cls: "good", text: "Rotation matches", dev: dev };
    if (Math.abs(dev) <= 0.3) return { cls: "warn", text: "Rotation off by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
    return { cls: "bad", text: "Rotation wrong by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
  }
  function renderRotResult() {
    const res = cache.res, mv = cache.movie, tr = mv.truth, rv = rotVerdict(), r = res.rot;
    const devT = res.D ? res.D.D_um2_s / trueD(tr) - 1 : null;
    const tv = devT === null ? { cls: "bad", text: "Translation not measured" } : Math.abs(devT) <= Math.max(0.05, 2 * res.D.rel_err) ? { cls: "good", text: "Translation matches" } : Math.abs(devT) <= 0.15 ? { cls: "warn", text: "Translation off by " + Math.round(100 * Math.abs(devT)) + " %" } : { cls: "bad", text: "Translation wrong by " + Math.round(100 * Math.abs(devT)) + " %" };
    const kT = 1.380649e-23 * (mv.T_C + 273.15), eta = mv.viscosity_Pa_s;
    let h = '<div class="eyebrow">Result</div>';
    h += '<div class="big">' + (r && r.D_r_s ? fmtRate(6 * r.D_r_s) : "-") + ' <small>rotation rate 6 D<sub>R</sub>' + (r && r.D_r_s ? ' &plusmn; ' + Math.max(1, Math.round(100 * r.rel_err)) + ' %' : '') + '</small></div>';
    h += '<span class="chip ' + tv.cls + '">' + tv.text + '</span> <span class="chip ' + rv.cls + '">' + rv.text + '</span>';
    if (rv.why) h += '<p class="small" style="margin:0">' + rv.why + '</p>';
    h += '<dl><dt>Translation D<sub>T</sub></dt><dd>' + (res.D ? fmtSig(res.D.D_um2_s, 3) : "-") + ' ' + MU + 'm<sup>2</sup>/s (true ' + fmtSig(tr.D_um2_s, 3) + (wallFactor(tr) < 0.97 ? ' in open liquid, ' + fmtSig(trueD(tr), 3) + ' averaged near the glass' : '') + ')</dd>';
    h += '<dt>Rotation D<sub>R</sub></dt><dd>' + (r && r.D_r_s ? fmtSig(r.D_r_s, 3) : "-") + ' s<sup>-1</sup> (true ' + fmtSig(tr.D_r_s, 3) + ')</dd>';
    if (state.shape === "bisphere" && res.D && r && r.D_r_s) {
      const dT = kT / (3 * Math.PI * eta * res.D.D_um2_s * 1e-12) * 1e6, dR = 2 * Math.cbrt(kT / (8 * Math.PI * eta * r.D_r_s)) * 1e6;
      h += '<dt>Diameter from translation</dt><dd>' + fmtSize(dT) + '</dd><dt>Diameter from rotation</dt><dd>' + fmtSize(dR) + ' (true ' + fmtSize(tr.diameter_um) + ')</dd>';
    } else h += '<dt>Particles</dt><dd>' + SHAPES[state.shape].toLowerCase() + ', ' + fmtSize(tr.diameter_um) + (BODY() ? ', aspect ratio ' + fmtSig(cache.cfg.aspect, 2) : '') + '</dd>';
    if (LEVEL_RANK[level] >= 3 && r && r.gain !== undefined) h += '<dt>Second mode</dt><dd>removes ' + Math.round(100 * r.gain) + ' % of the one-mode misfit; ' + Math.round(100 * (r.fast_share || 0)) + ' % of the signal' + (r.D_r_s ? '; rate from the ' + (r.from || 'joint fit') + (r.joint_rate_s && r.from !== 'joint fit' ? ' (joint fit: ' + fmtRate(r.joint_rate_s) + ')' : '') : '') + '</dd>';
    h += '</dl>';
    $("result").innerHTML = h;
    $("hero-result").innerHTML = '<span>True turning rate</span><span class="n">' + fmtRate(6 * tr.D_r_s) + '</span><span>Measured by DDM</span><span class="n">' + (r && r.D_r_s ? fmtRate(6 * r.D_r_s) : "not seen") + '</span><span class="chip ' + rv.cls + '">' + rv.text + '</span>';
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie" + (cache.cfg.polarization ? " between polarizers" : "") + ", " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  const MODE_SHORT = { brightfield: "bright-field", phase: "phase-contrast", darkfield: "dark-field", dic: "DIC", fluorescence: "widefield fluorescence", spinning: "spinning-disk confocal (X-Light V3)", scanning: "point-scanning confocal (AX R)" };
  // width of the image of a point (Rayleigh distance, 0.61 lambda / NA): the smallest spot the optics can make
  function spotWidth() { return 0.61 * centralWavelength() / Math.min(objective().na, nLiquid(centralWavelength())); }
  const MODEL_NAME = { simple: "simple exponential", stretched: "stretched exponential", schulz: "Schulz distribution of rates", two: "two-mode model", three: "three-mode model" };
  function pctTxt(x) { return x === null || x === undefined || !isFinite(x) ? "-" : (x < 0.0995 ? (100 * x).toFixed(1) : Math.round(100 * x)) + " %"; }
  // ISO 22412 applies its repeatability figure to monodisperse particles of 50-200 nm
  function isoRange() { return cache.cfg.size_spread === 0 && cache.cfg.diameter_um >= 0.05 && cache.cfg.diameter_um <= 0.2 && state.shape === "sphere"; }
  /* Quality checks after ISO 22412 (10.1-10.3), plus the diffusive scaling DDM adds. Each: cls (good, warn, bad,
   * info), what was checked, the numbers, and what to do when it fails. */
  function qualityChecks() {
    const res = cache.res, cfg = cache.cfg, out = [], iso = isoRange(), rp = repeat && repeat.done ? repeat : null;
    const mainTxt = "the fit at each q (" + MODEL_NAME[res.fit_model] + ")";
    // repeatability
    if (rp) {
      const st = repeatStats(rp.runs.map(function (r) { return r.main_d; }));
      const ok = st.rsd < 0.02;
      out.push({ cls: iso ? (ok ? "good" : "bad") : "info", title: "Repeatability (ISO 22412, 10.3)", text: "Five new movies, sizes from " + mainTxt + ": relative standard deviation " + pctTxt(st.rsd) + "; ISO asks below 2 % for monodisperse particles of 50-200 nm" + (iso ? "." : " (these particles are outside that range, so the figure is only indicative).") + (ok ? "" : " To improve: more frames, a larger field (more particles), or a longer movie; DLS averages over far more particles and much longer times.") });
    } else if (res.jackknife) {
      out.push({ cls: "info", title: "Repeatability (estimate)", text: "The fits repeated " + res.jackknife.blocks + " times, each time with one " + ["", "", "half", "third", "quarter", "fifth", "sixth"][res.jackknife.blocks] + " of the movie left out (every delay is kept), give " + pctTxt(res.jackknife.rel_err) + " for the size from " + mainTxt + ". In simulations this matched or exceeded the scatter from movie to movie, but the parts share the same particles. Use \"Repeat 5 times\" below for the ISO test (target below 2 %" + (iso ? "" : "; strictly for monodisperse 50-200 nm") + ")." });
    } else if (res.blocks) {
      const est = res.blocks.rel_err_full;
      out.push({ cls: "info", title: "Repeatability (estimate)", text: "From " + res.blocks.n_blocks + " parts of this movie (" + res.blocks.frames_per_block + " frames each), sizes from " + mainTxt + ": a full movie should repeat within about " + pctTxt(est) + ". This is a lower bound, because the parts share the same particles. Use \"Repeat 5 times\" below for the ISO test (target below 2 %" + (iso ? "" : "; strictly for monodisperse 50-200 nm") + ")." });
    }
    // polydispersity index
    const cu = res.cumulants;
    if (cu && cu.pi !== null) {
      const spread = cfg.size_spread > 0, ok = cu.pi < 0.1, floor = 2 * cu.pi_err;
      out.push({ cls: spread ? "info" : (ok ? "good" : "bad"), title: "Polydispersity index (ISO 22412, 10.1)", text: "Cumulants give PI " + cu.pi.toFixed(3) + " \u00b1 " + cu.pi_err.toFixed(3) + "; ISO expects below 0.1 for a narrow reference latex" + (spread ? ". This sample has a spread of sizes on purpose." : ok ? "." : ". With identical particles a large PI points to noise, drift or particles crossing the focal plane.") +
        " With this movie a PI below about " + floor.toFixed(3) + " (twice its uncertainty) cannot be told from identical particles: that hides spreads of sizes up to about " + Math.round(100 * Math.sqrt(floor / (1 - 4 * Math.min(floor, 0.2)))) + " %. Repeating the movie five times and averaging, or a longer movie, lowers this limit." });
    }
    // range independence
    const hv = res.halves;
    if (hv) {
      const dl = sizeFromD(hv.low.D_um2_s), dh = sizeFromD(hv.high.D_um2_s), dev = Math.abs(Math.log(hv.low.D_um2_s / hv.high.D_um2_s)), sig = Math.hypot(hv.low.rel_err, hv.high.rel_err);
      const cls = dev < Math.max(2 * sig, 0.03) ? "good" : dev < Math.max(3 * sig, 0.08) ? "warn" : "bad";
      out.push({ cls: cls, title: "Same size at small and large q (ISO 22412, 10.2)", text: "Below q = " + hv.q_split_per_um.toFixed(2) + " " + MU + "m\u207b\u00b9: " + fmtSize(dl) + "; above: " + fmtSize(dh) + "." + (cls === "good" ? "" : cfg.size_spread > 0 ? " With a spread of sizes the weights change with q, so some difference is expected." : " A smaller size at small q usually means particles leaving the focal plane; a q dependence can also come from drift or from interactions.") });
    }
    // diffusive scaling
    if (res.slope) {
      const e = res.slope.exponent, d = Math.abs(e - 2), cls = d < 0.1 ? "good" : d < 0.25 ? "warn" : "bad";
      out.push({ cls: cls, title: "Rates grow as q\u00b2 (diffusion)", text: "A free power law gives exponent " + e.toFixed(2) + " (2 for diffusion)." + (cls === "good" ? "" : " Below 2: drift or flow; at small q also particles leaving the focal plane. Above 2: usually noise at the ends of the range.") });
    }
    // methods agree
    if (cu && cu.D_um2_s && res.D) {
      const dev = Math.abs(Math.log(cu.D_um2_s / res.D.D_um2_s)), tol = Math.max(0.05, 2 * Math.hypot(cu.rel_err, res.D.rel_err));
      out.push({ cls: dev < tol ? "good" : "warn", title: "Methods agree", text: "Cumulants " + fmtSize(sizeFromD(cu.D_um2_s)) + " against " + fmtSize(res.diameter_um) + " from " + mainTxt + "." + (dev < tol ? "" : " A clear difference means the curves are not single exponentials: a spread of sizes, or a second process.") });
    }
    // bias against the true value, as in the reference-material test of ISO 10.1 (the simulation is the certificate)
    if (rp) {
      const st = repeatStats(rp.runs.map(function (r) { return r.main_d; })), tru = rp.runs.reduce(function (a, r) { return a + r.true_d; }, 0) / rp.runs.length;
      const diff = Math.abs(st.mean / tru - 1), U = 2 * 0.015;
      out.push({ cls: diff < U ? "good" : "bad", title: "Bias against the true size (ISO 22412, 10.1)", text: "Mean of five " + fmtSize(st.mean) + " against " + fmtSize(tru) + " (the simulation plays the certified reference): " + pctTxt(diff) + " off; ISO allows the expanded uncertainty, here 3 %." + (diff < U ? "" : " Here the usual cause is the focal plane: the image of a particle changes as it moves up and down, which adds to the decay of the patterns. In the default bright-field case this alone makes sizes about 2-3 % small (with heights frozen, a test only a simulation can do, the bias drops to about 1 %); real DDM has the same effect, DLS has no focal plane. It grows with the NA and in confocal modes; aliasing with large pixels and too few particles add to it.") });
    }
    return out;
  }
  function repeatStats(v) { const n = v.length, m = v.reduce(function (a, b) { return a + b; }, 0) / n, sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / Math.max(1, n - 1)); return { mean: m, sd: sd, rsd: sd / m }; }
  function renderResult() {
    if ((cache.res.fit_model === "two" || cache.res.fit_model === "three") && cache.movie.truth.oriented) { renderRotResult(); return; }
    const res = cache.res, mv = cache.movie, tr = mv.truth, v = verdict(), cfg = cache.cfg, fw = wallFactor(tr);
    const cu = res.cumulants, sch = cu ? cu.schulz_shared : null;
    let h = '<div class="eyebrow">Result</div>';
    h += res.diameter_um === null ? '<div class="big">No result</div>' : '<div class="big">' + fmtSize(res.diameter_um) + ' <small>&plusmn; ' + Math.max(1, Math.round(100 * res.diameter_rel_err)) + ' %</small></div>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    if (v.why) h += '<p class="small" style="margin:0">' + v.why + '</p>';
    if (res.diameter_um !== null) h += '<p class="small" style="margin:0">Hydrodynamic diameter from a fit at each q with a ' + MODEL_NAME[res.fit_model] + ' (change it under Analysis). True: ' + fmtSize(tr.diameter_um) + (cfg.size_spread > 0 ? ' (number mean), ' + fmtSize(seenDiameter(tr, res)) + ' as weighted by the signal' : '') + '.</p>';
    if (level !== "curious" && res.diameter_um !== null) {
      // every method side by side; the headline row is marked
      // PI cell: value, its uncertainty and the equivalent relative width of the rates, sqrt(PI)
      const piCell = function (pi, pe) {
        if (pi === null || pi === undefined) return "-";
        let t = pi.toFixed(3) + (pe !== null && pe !== undefined ? " \u00b1 " + pe.toFixed(3) : "");
        if (pi > 0 && (pe === null || pe === undefined || pi > 2 * pe)) t += '<span class="note">width about ' + Math.round(100 * Math.sqrt(pi)) + ' %</span>';
        else if (pe !== null && pe !== undefined) t += '<span class="note">consistent with 0</span>';
        return t;
      };
      const row = function (cls, name, d, pi, pe, err, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + (d ? fmtSize(d) : "-") + '</td><td>' + piCell(pi, pe) + '</td><td>' + (err === null || err === undefined ? "-" : "\u00b1 " + pctTxt(err)) + '</td></tr>'; };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">Size</th><th scope="col">PI</th><th scope="col">Uncertainty</th></tr></thead><tbody>';
      t += row("main", "Fit at each q: " + MODEL_NAME[res.fit_model], res.diameter_um, null, null, res.diameter_rel_err, "the headline");
      if (level === "addict" && res.published) t += row("pub", "Published method only", res.published.diameter_um, null, null, res.published.rel_err, "the same fit on the same movie, without what this page adds" + (res.published.n_used ? ", " + res.published.n_used + " q" : ""));
      if (cu && cu.D_um2_s) t += row("", "Cumulants, 2nd order", sizeFromD(cu.D_um2_s), cu.pi, cu.pi_err, cu.rel_err, "as in ISO 22412, " + cu.n_points + " q");
      if (sch) t += row("", "Schulz, one PI for all q", sizeFromD(sch.D_um2_s), sch.pi, sch.pi_err, sch.rel_err, sch.n_points + " q");
      const qs = cu && cu.per_q.length ? cu.per_q.map(function (e) { return e.q_per_um; }) : res.used.map(function (f) { return f.q_per_um; }), tt = seenOver(tr, qs);
      const sg = cfg.size_spread;
      t += row("truth", "True (simulation)", sg > 0 ? seenDiameter(tr, res) : tr.diameter_um / fw, sg > 0 ? tt.pi : 0, null, null, sg > 0 ? "weighted by the signal; a " + Math.round(100 * sg) + " % spread of sizes gives PI about s\u00b2/(1 + 4s\u00b2) = " + (sg * sg / (1 + 4 * sg * sg)).toFixed(4) : (fw < 0.97 ? "in-plane, near the glass" : ""));
      t += '</tbody></table></div>';
      h += t;
      // quality checks
      const ch = qualityChecks();
      if (ch.length) h += '<div class="checks"><div class="eyebrow">Quality checks, after ISO 22412</div><ul>' + ch.map(function (c) { return '<li><span class="chip ' + c.cls + '">' + ({ good: "Pass", warn: "Check", bad: "Fail", info: "Note" })[c.cls] + '</span><div><b>' + c.title + '.</b> ' + c.text + '</div></li>'; }).join("") + '</ul></div>';
      // repeat five times
      h += '<div class="btns"><button type="button" id="btn-repeat"' + (repeat && !repeat.done ? ' disabled' : '') + '>' + (repeat && !repeat.done ? 'Repeating... ' + repeat.runs.length + ' of 5' : repeat && repeat.done ? 'Repeat 5 times again' : 'Repeat 5 times with new particles') + '</button><span class="small">' + (lastRunS ? 'about ' + Math.max(5, Math.round(5 * lastRunS)) + ' s' : '') + '</span></div>';
      if (repeat && repeat.runs.length) h += renderRepeatTable();
      // details
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Diffusion coefficient</dt><dd>' + (res.D ? fmtSig(res.D.D_um2_s, 3) : "-") + ' ' + MU + 'm<sup>2</sup>/s (true ' + (cfg.size_spread > 0 ? fmtSig(trueD(tr) / wallFactor(tr), 3) + ' weighted by the signal' : fmtSig(tr.D_um2_s, 3)) + (fw < 0.97 ? ' in open liquid, ' + fmtSig(trueD(tr), 3) + ' averaged near the glass' : '') + ')</dd>';
      h += '<dt>Liquid</dt><dd>' + LIQUIDS[state.liquid] + (state.liquid === "glycerol" ? " " + Math.round(100 * state.glycerol_w) + " %" : "") + ', ' + state.T_C.toFixed(0) + ' &deg;C, ' + (mv.viscosity_Pa_s * 1000).toFixed(2) + ' mPa s</dd>';
      h += '<dt>Wave vectors used</dt><dd>' + (res.D ? res.D.n_points : 0) + (res.used.length ? ', ' + res.used[0].q_per_um.toFixed(2) + ' to ' + res.used[res.used.length - 1].q_per_um.toFixed(2) + ' ' + MU + 'm\u207b\u00b9' : '') + '</dd>';
      h += '<dt>Uncertainty</dt><dd>larger of the scatter between q (' + pctTxt(res.diameter_rel_err_points) + ')' + (res.jackknife ? ' and the jackknife: the fits repeated with one of ' + res.jackknife.blocks + ' parts of the movie left out (' + pctTxt(res.jackknife.rel_err) + ')' : res.blocks ? ' and the spread of ' + res.blocks.n_blocks + ' parts of the movie / &radic;' + res.blocks.n_blocks + ' (' + pctTxt(res.blocks.rel_err_full) + ')' : '') + '</dd>';
      h += '<dt>Camera noise</dt><dd>' + (res.noise_B ? 'B = ' + fmtSig(res.noise_B, 3) + ' from the mean count, the read noise and the excess-noise factor of the camera, the same at every q' : 'B fitted at each q, between 0 and the first point of the curve') + '</dd>';
      h += '<dt>Windowing</dt><dd>' + (res.windowing ? 'on: each frame multiplied by a Blackman-Harris window that falls to zero at the edges (Giavazzi et al. 2017); patterns wider than a fifth of the field left out' : 'off (the central cross of the map is left out instead)') + '</dd>';
      h += '<dt>Depth of field</dt><dd>' + (res.depth_model ? 'included: a particle that diffuses up or down fades from each pattern through the optics of step 1, and the fit allows for it' : 'not included') + '</dd>';
      if (res.beta_mean !== null) h += '<dt>Mean stretching &beta;</dt><dd>' + res.beta_mean.toFixed(2) + '</dd>';
      if (cu && cu.third) h += '<dt>Cumulants, 3rd order</dt><dd>' + fmtSize(sizeFromD(cu.third.D_um2_s)) + ', PI ' + cu.third.pi.toFixed(3) + ' &plusmn; ' + cu.third.pi_err.toFixed(3) + ' (less biased for broad distributions, but noisier)</dd>';
      h += '</dl></details>';
    }
    const ax = axialNote(res, v);
    if (ax) h += '<p class="small" style="margin:0">' + ax + '</p>';
    $("result").innerHTML = h;
    const br = $("btn-repeat"); if (br) br.addEventListener("click", startRepeat);
    $("hero-result").innerHTML = res.diameter_um === null
      ? '<span>Particles of ' + fmtSize(tr.diameter_um) + '. With these settings DDM cannot size them.</span><span class="chip bad">Not measurable</span>'
      : (cache.cfg.size_spread > 0
        ? '<span>True mean size</span><span class="n">' + fmtSize(tr.diameter_um) + '</span><span>weighted as DDM sees them</span><span class="n">' + fmtSize(seenDiameter(tr, res)) + '</span>'
        : '<span>True size</span><span class="n">' + fmtSize(tr.diameter_um) + '</span>') + '<span>Measured by DDM</span><span class="n">' + fmtSize(res.diameter_um) + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie, " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m." + (tr.diameter_um < spotWidth() ? " Each spot is one particle, blurred by the optics to more than its true size." : "");
  }
  function renderRepeatTable() {
    const rp = repeat, rows = rp.runs;
    let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Movie</th><th scope="col">Fit at each q</th><th scope="col">Cumulants</th><th scope="col">PI cumulants</th><th scope="col">PI Schulz</th></tr></thead><tbody>';
    rows.forEach(function (r, k) { t += '<tr><th scope="row">' + (k + 1) + '</th><td>' + fmtSize(r.main_d) + '</td><td>' + (r.cum_d ? fmtSize(r.cum_d) : "-") + '</td><td>' + (r.cum_pi === null ? "-" : r.cum_pi.toFixed(3)) + '</td><td>' + (r.sch_pi === null || r.sch_pi === undefined ? "-" : r.sch_pi.toFixed(3)) + '</td></tr>'; });
    if (rows.length >= 2) {
      const a = repeatStats(rows.map(function (r) { return r.main_d; })), cs = rows.filter(function (r) { return r.cum_d; }), b = cs.length >= 2 ? repeatStats(cs.map(function (r) { return r.cum_d; })) : null;
      const ps = rows.filter(function (r) { return r.cum_pi !== null; }), c = ps.length >= 2 ? repeatStats(ps.map(function (r) { return r.cum_pi; })) : null;
      const zs = rows.filter(function (r) { return r.sch_pi !== null && r.sch_pi !== undefined; }), e = zs.length >= 2 ? repeatStats(zs.map(function (r) { return r.sch_pi; })) : null;
      t += '<tr class="main"><th scope="row">Mean</th><td>' + fmtSize(a.mean) + '</td><td>' + (b ? fmtSize(b.mean) : "-") + '</td><td>' + (c ? c.mean.toFixed(3) : "-") + '</td><td>' + (e ? e.mean.toFixed(3) : "-") + '</td></tr>';
      t += '<tr><th scope="row">Spread</th><td>' + pctTxt(a.rsd) + '</td><td>' + (b ? pctTxt(b.rsd) : "-") + '</td><td>' + (c ? "\u00b1 " + (c.sd / Math.sqrt(ps.length)).toFixed(3) : "-") + '</td><td>' + (e ? "\u00b1 " + (e.sd / Math.sqrt(zs.length)).toFixed(3) : "-") + '</td></tr>';
      t += '<tr><td colspan="5" class="small" style="text-align:left; white-space: normal;">Sizes: relative standard deviation of the five. PI: uncertainty of the mean of five (standard deviation / &radic;5).</td></tr>';
    }
    return t + '</tbody></table></div>';
  }
  // what the reader can expect to see in the movie: resolved particles, or spots set by the optics
  function visibilityText(cfg, m) {
    const w = spotWidth(), d = cfg.diameter_um;
    if (d >= w) return "These particles are larger than the smallest detail the microscope resolves, so you see each one " + (TURNS() ? "with its shape" : "as a small disc or ring") + "; DDM still never needs to find them.";
    let t = "Each particle is smaller than the smallest detail the microscope resolves (about " + fmtSig(w, 2) + " " + MU + "m here), so it shows as a blurred spot of about that width, whatever its true size: you can follow the spots, but not measure the particles from them.";
    // spots in the in-focus layer (depth of field about n lambda / NA^2) and their mean distance
    const lam = centralWavelength(), na = Math.min(objective().na, nLiquid(lam)), dof = Math.min(cfg.cell_um, nLiquid(lam) * lam / (na * na) + w);
    const nIn = (m.info.n_particles || 0) * dof / cfg.cell_um, gap = nIn > 0 ? m.L_um / Math.sqrt(nIn) : Infinity;
    if (gap < 1.5 * w) t += " There are so many of them that the spots overlap into a shifting grain.";
    else if (d < 0.1 && TRANS()) t += " Particles this small give faint spots that can drown in the camera noise.";
    return t;
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg;
    const modeTxt = { brightfield: "a bright-field microscope", phase: "a phase-contrast microscope", darkfield: "a dark-field microscope", dic: "a DIC microscope", fluorescence: "a widefield fluorescence microscope", spinning: "a spinning-disk confocal microscope", scanning: "a point-scanning confocal microscope" }[state.mode];
    const shapeTxt = state.shape === "sphere" ? "" : { bisphere: "birefringent spherical ", prolate: "cigar-shaped ", oblate: "disc-shaped ", rod: "rod-shaped " }[state.shape];
    $("movie-text").textContent = "The movie shows " + fmtSize(cfg.diameter_um) + " " + shapeTxt + MATERIALS[state.particle].toLowerCase().replace(" (set the index)", "") + " particles in " + (LIQUIDS[state.liquid].toLowerCase()) + ", filmed through " + modeTxt + " " + fmtNum(cfg.frame_rate_hz) + " times a second. " +
      visibilityText(cfg, m) + " Particles above and below the focal plane add wider, fainter blurs." + (TURNS() ? " They also turn, which changes how they look" + (cfg.polarization ? " between the polarizers." : state.mode === "darkfield" ? " in dark field." : ".") : "");
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + (m.times_s ? m.T + " frames at log-spaced times, shortest interval 1/" + fmtNum(m.frame_rate_hz) + " s, over " + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) : m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s") + ". Cell " + cfg.cell_um + " " + MU + "m thick, focus " + fmtSig(cfg.focus_um, 2) + " " + MU + "m above the bottom, " + m.info.n_particles + " particles.";
    if ($("turn-note")) $("turn-note").hidden = !TURNS();
    $("diff-note").textContent = "A particle that moved leaves a pair of spots, one darker and one brighter, at its old and its new place. Their arrangement looks random; the order hidden in it appears in the next step.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const r = cache.res, i = cache.movie.info;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: state.mode, condenser: BF() ? CONDENSERS[state.condenser].label : state.mode === "darkfield" && state.df_kind !== "annulus" ? DFCOND[state.df_kind].label : (state.mode === "phase" || state.mode === "darkfield") ? "annulus " + state.annulus : null, detector: SCANNING() ? "Nikon AX R, " + SCANNERS[state.scanner].label : cam().label + ", " + cam().modes[state.cam_mode].label, simulation: cache.cfg, analysis: cache.opts,
      optics: { particles: i.n_particles, kernel_rank: i.rank, kernel_residual: +i.rank_residual.toExponential(1), scattered_intensity_term: cache.cfg.homodyne, extinction_um2: i.Cext_um2 === null ? null : +i.Cext_um2.toPrecision(3), aliasing_left_out_above_q: i.truncated_q_per_um },
      result: r.D ? { D_um2_s: +r.D.D_um2_s.toPrecision(4), diameter_nm: Math.round(r.diameter_um * 1000), rel_err: +r.diameter_rel_err.toFixed(3), points: r.D.n_points } : null,
      rotation: r.rot ? (r.rot.D_r_s ? { D_r_per_s: +r.rot.D_r_s.toPrecision(4), rel_err: +r.rot.rel_err.toFixed(3), points: r.rot.n_points } : { none: r.rot.reason }) : undefined };
    $("settings-json").textContent = JSON.stringify(obj, null, 1);
  }
  // a test report in the style of ISO 22412 clause 11, for this simulated run
  function renderReport() {
    const el = $("iso-report"); if (!el) return;
    const r = cache.res, mv = cache.movie, cfg = cache.cfg, tr = mv.truth, L = [];
    const pc = function (x) { return (100 * x).toFixed(1) + " %"; };
    L.push("TEST REPORT (simulated measurement; format after ISO 22412:2025, clause 11)");
    L.push("Generated by the DDM, hands on page on " + new Date().toISOString().slice(0, 10) + ". Simulated data: not a real measurement.");
    L.push("");
    L.push("Results");
    if (r.D) {
      L.push("  Mean hydrodynamic diameter (fit of each q, Gamma = D q^2): " + fmtSize(r.diameter_um) + ", relative uncertainty " + pc(r.diameter_rel_err));
      if (r.cumulants && r.cumulants.D_um2_s) L.push("  Cumulants: mean diameter " + fmtSize(sizeFromD(r.cumulants.D_um2_s)) + ", polydispersity index PI " + r.cumulants.pi.toFixed(3) + " +- " + r.cumulants.pi_err.toFixed(3) + " (" + r.cumulants.n_points + " q)");
      if (r.cumulants && r.cumulants.schulz_shared) L.push("  Schulz fit with one PI for all q: mean diameter " + fmtSize(sizeFromD(r.cumulants.schulz_shared.D_um2_s)) + ", PI " + r.cumulants.schulz_shared.pi.toFixed(3) + (r.cumulants.schulz_shared.pi_err !== null ? " +- " + r.cumulants.schulz_shared.pi_err.toFixed(3) : ""));
      if (r.jackknife) L.push("  Uncertainty: jackknife over " + r.jackknife.blocks + " blocks of the movie (each left out in turn, all delays kept), relative " + pc(r.jackknife.rel_err));
      if (r.blocks) L.push("  Repeatability: " + r.blocks.n_blocks + " parts of " + r.blocks.frames_per_block + " frames, diameters " + r.blocks.D_um2_s.map(function (D) { return fmtSize(sizeFromD(D)); }).join(", ") + ", relative SD " + pc(r.blocks.rel_sd));
      L.push("  Number of individual measurements: 1 movie (" + mv.T + " frames), " + r.D.n_points + " wave vectors");
    } else L.push("  No result: too few usable wave vectors.");
    L.push("");
    L.push("Evaluation");
    L.push("  Algorithm: differential dynamic microscopy; structure function azimuthally averaged (central cross masked); " + (r.noise_B ? "camera noise B from the mean count, read noise and excess-noise factor, the same at every q" : r.B_floor !== null && r.B_floor !== undefined ? "noise B from the flat floor beyond the optical cut-off" : "noise B from the zero-delay intercept of the first five delays") + (r.depth_model ? "; depth of field included (axial diffusion through the optical kernel)" : "") + (r.windowing ? "; each frame multiplied by a Blackman-Harris window before the transform (Giavazzi et al. 2017), widest patterns left out" : "") + ", A + B = 2 var; " + MODEL_NAME[r.fit_model] + " fit at each q; D as the weighted mean of Gamma / q^2 (geometric mean, logarithmic scale); cumulants to second order on f(q, dt) from f = 1 down to f1/10.");
    L.push("  Wave vectors used: " + (r.used.length ? r.used[0].q_per_um.toFixed(2) + " to " + r.used[r.used.length - 1].q_per_um.toFixed(2) + " um^-1" : "none") + "; delays " + fmtTime(r.taus_s[0]) + " to " + fmtTime(r.taus_s[r.taus_s.length - 1]) + ".");
    L.push("  Results are weighted by the signal of each particle in the images (the counterpart of intensity weighting in DLS); no conversion to volume or number distributions.");
    L.push("");
    L.push("Sample (simulated)");
    L.push("  Particles: " + SHAPES[state.shape].toLowerCase() + ", " + MATERIALS[state.particle].replace(" (set the index)", "") + ", nominal diameter " + fmtSize(cfg.diameter_um) + (cfg.size_spread > 0 ? ", " + (cfg.size_distribution === "lognormal" ? "log-normal" : "Schulz") + " distribution with relative SD " + Math.round(100 * cfg.size_spread) + " %" : ", monodisperse") + "; non-interacting; volume fraction " + fmtSig(cfg.volume_fraction, 2) + " (" + mv.info.n_particles + " particles simulated)");
    L.push("  Liquid: " + LIQUIDS[state.liquid] + (state.liquid === "glycerol" ? " " + Math.round(100 * state.glycerol_w) + " %" : "") + ", viscosity " + (mv.viscosity_Pa_s * 1000).toFixed(3) + " mPa s, refractive index " + nLiquid(centralWavelength()).toFixed(4) + "; temperature " + state.T_C.toFixed(1) + " C");
    L.push("  Cell " + cfg.cell_um + " um thick, focus " + fmtSig(cfg.focus_um, 2) + " um above the bottom" + (state.settle === "on" ? ", with gravity and wall hindrance" : ""));
    L.push("");
    L.push("Measurement conditions (simulated)");
    L.push("  Microscope: Nikon Ti2-E, " + objective().n + ", " + ($("c-mode").selectedOptions[0].textContent) + "; detector " + (SCANNING() ? "Nikon AX R" : cam().label));
    L.push("  Movie: " + mv.n + " x " + mv.n + " pixels of " + fmtSig(mv.pixel_um, 3) + " um, " + (mv.times_s ? mv.T + " frames at log-spaced times (shortest interval 1/" + fmtNum(mv.frame_rate_hz) + " s, duration " + fmtSig(mv.times_s[mv.T - 1] + 1 / mv.frame_rate_hz, 3) + " s)" : mv.T + " frames at " + fmtNum(mv.frame_rate_hz) + " frames/s (duration " + fmtSig(mv.T / mv.frame_rate_hz, 3) + " s)"));
    L.push("");
    L.push("True values of the simulation: diameter " + fmtSize(tr.diameter_um) + (cfg.size_spread > 0 ? ", signal-weighted " + fmtSize(seenDiameter(tr, r)) : "") + ".");
    el.textContent = L.join("\n");
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + (res.pairs ? " (" + res.lags[li] + (res.lags[li] === 1 ? " frame interval, " : " frame intervals, ") + res.pairs[li].length / 2 + " pairs of frames)" : " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)")); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawRates(); drawSize(); drawAmp(); renderResult(); renderSettings(); renderReport();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  function P_DDM(angle) { return { shape: "bisphere", particle: "rm257", dn: 0.1, diameter_um: 0.37, phi: 4e-5, cell_um: 50, objective: objIndexByName("CFI Achromat LWD 20X"), condenser: "elwd", na_c: 0.3, source: "halogen", polarizer: "on", analyzer: "on", pol_angle_deg: angle, roi: 256, binning: 2, sim_px: 64, n_frames: 2048, frame_rate_hz: 800, exposure_ms: 1.2, T_C: 20 }; }
  function MFA_SET() { return { shape: "bisphere", particle: "mfa", dn: 0.02, diameter_um: 0.18, phi: 1e-3, cell_um: 20, objective: objIndexByName("CFI Plan Fluor 40X"), condenser: "lwd", na_c: 0.5, source: "m530", polarizer: "on", analyzer: "on", pol_angle_deg: 90, camera: "kinetix", roi: 64, binning: 1, sim_px: 64, n_frames: 2048, frame_rate_hz: 4000, exposure_ms: 0.15, T_C: 22, df_light_e: 1e8 }; }
  function ECOLI(mode) { return { sim_px: BASE.sim_px, shape: "rod", particle: "bacterium", diameter_um: 2, aspect: 2.5, liquid: "custom", n_liquid: 1.345, visc_mPa_s: 1.87, T_C: 24, mode: mode, df_kind: "annulus", annulus: "Ph3", condenser: "lwd", na_c: 0.3, objective: objIndexByName("CFI Achromat 10X"), binning: 2, frame_rate_hz: 20, exposure_ms: 5, n_frames: 512, phi: 4e-4, cell_um: 50, source: "halogen", settle: "on", rho_liquid: 1.10 }; }
  function PEANUT(images) { return { sim_px: BASE.sim_px, shape: "prolate", particle: "silica", diameter_um: 1.72, aspect: 2.3, objective: objIndexByName("CFI S Plan Fluor ELWD 40XC"), condenser: "lwd", na_c: 0.52, binning: 2, frame_rate_hz: 25, exposure_ms: 2, n_frames: 512, phi: 5e-3, cell_um: 5, focus_frac: 0.12, settle: "on", images: images }; }
  const CARDS = [
    { lvl: 1, title: "A camera that is too slow", text: "If a pattern renews completely between two frames, its rate cannot be read. Fine patterns are lost first. Use a faster frame rate (a smaller region of interest on the camera allows it), or a lower magnification, which looks at wider and slower patterns.",
      shows: [{ label: "Show me", set: { frame_rate_hz: 8, exposure_ms: 1 }, go: "step-rates" }] },
    { lvl: 1, title: "A movie that is too short", text: "Wide patterns change slowly. If the movie ends before they have renewed, their curves never reach the top. Large particles need long movies.",
      shows: [{ label: "Show me", set: { diameter_um: 1, phi: 1e-3, frame_rate_hz: 100, n_frames: 128 }, go: "step-curves" }] },
    { lvl: 1, title: "Too little light", text: "Shot noise adds a flat floor to every curve and hides the patterns whose signal is weakest. More light helps most; binning (a wider field with coarser pixels) and more frames help a little.",
      shows: [{ label: "Dim light", set: { light_frac: 0.005 }, go: "step-rates" }, { label: "Dim light, 2 x 2 binning", set: { light_frac: 0.005, binning: 2 }, go: "step-rates" }, { label: "Four times more light", set: { light_frac: 0.02 }, go: "step-rates" }] },
    { lvl: 2, title: "Matching refractive indices", text: "A particle is visible in bright field only because its refractive index differs from the liquid's. PMMA (1.49) in water with 90 % glycerol (1.46) almost disappears, and so does the signal.",
      shows: [{ label: "PMMA in water", set: { particle: "pmma", diameter_um: 0.3, phi: 2e-4, frame_rate_hz: 100 }, go: "step-setup" }, { label: "PMMA in 90 % glycerol", set: { particle: "pmma", diameter_um: 0.3, phi: 2e-4, liquid: "glycerol", glycerol_w: 0.9, frame_rate_hz: 2 , exposure_ms: 1 }, go: "step-setup" }] },
    { lvl: 2, title: "The condenser aperture", text: "Closing the aperture diaphragm makes the light more coherent: particles show stronger, ringed images and stay visible further from focus. Opening it gives sharper optical sections and less contrast.",
      shows: [{ label: "Nearly closed (NA 0.05)", set: { na_c: 0.05 }, go: "step-setup" }, { label: "LWD fully open (NA 0.52)", set: { condenser: "lwd", na_c: 0.52 }, go: "step-setup" }] },
    { lvl: 2, title: "Magnification and aperture", text: "The objective sets which patterns you can see. Low magnification gives a wide field and reaches large spacings; a high numerical aperture resolves finer ones. The dashed circle in step 4 moves with it.",
      shows: [{ label: "10x, NA 0.3", set: { objective: objIndexByName("CFI Plan Fluor 10X"), frame_rate_hz: 30 }, go: "step-map" }, { label: "40x, NA 0.75", set: { objective: objIndexByName("CFI Plan Fluor 40X"), frame_rate_hz: 300, exposure_ms: 1, phi: 4e-4 }, go: "step-map" }] },
    { lvl: 2, title: "Confocal sectioning", text: "A confocal microscope sees a thin slice. Particles that wander out of the slice look as if they had renewed the pattern, so at small q the rate stops falling and levels off at about one over the time needed to diffuse out of the slice. Compare the points with the dashed line of pure diffusion; the size comes out too small.",
      shows: [{ label: "Spinning disk, Kinetix", set: { mode: "spinning", camera: "kinetix", cam_mode: "dynamic", iface: "pcie", binning: 2, n_frames: 512, objective: objIndexByName("CFI Plan Apochromat IR 60XC WI"), diameter_um: 0.2, phi: 1e-4, cell_um: 10, focus_frac: 0.5, frame_rate_hz: 100, exposure_ms: 4 }, go: "step-rates" },
              { label: "Point scanning, AX R", set: { mode: "scanning", objective: objIndexByName("CFI Plan Apochromat IR 60XC WI"), diameter_um: 0.5, phi: 1e-3, cell_um: 10, focus_frac: 0.5, scan_px: 512, line_avg: 2, frame_rate_hz: 14, scan_rate: 1e8 }, go: "step-rates", lvl: 3 }] },
    { lvl: 2, title: "Phase contrast and dark field", text: "Phase contrast turns the particles' phase delay into brightness, with the typical halo. Dark field throws away the direct light, so only scattered light reaches the camera: small particles shine on black, and the noise is set by the scattered light itself, not by a bright background.",
      shows: [{ label: "Phase contrast, 40x Ph2", set: { mode: "phase", objective: objIndexByName("CFI Plan Fluor DLL 40X"), annulus: "Ph2", diameter_um: 0.3, phi: 2e-4, frame_rate_hz: 200, exposure_ms: 0.2 }, go: "step-setup" },
              { label: "Poor man's dark field: Ph3 annulus, 10x", set: { mode: "darkfield", df_kind: "annulus", annulus: "Ph3", objective: objIndexByName("CFI Plan Fluor 10X"), diameter_um: 0.3, phi: 5e-5, frame_rate_hz: 30 }, go: "step-setup" },
              { label: "Rich man's dark field: dry condenser, 20x", set: { mode: "darkfield", df_kind: "dry", diameter_um: 0.3, phi: 2e-4, frame_rate_hz: 100 }, go: "step-setup" }] },
    { lvl: 2, title: "DIC sees a direction", text: "DIC compares the image with a copy shifted by a fraction of a micrometre. Stripes that run along the shear barely show for particles near focus, so the map in step 4 gets squashed along one direction; particles far from focus look the same in every direction and round it again. The radial average still gives the right dynamics.",
      shows: [{ label: "DIC, 60x water", set: { mode: "dic", objective: objIndexByName("CFI Plan Apochromat IR 60XC WI"), condenser: "lwd", na_c: 0.5, diameter_um: 0.3, phi: 4e-4, cell_um: 10, focus_frac: 0.5, frame_rate_hz: 200, exposure_ms: 0.2 }, go: "step-map" }] },
    { lvl: 3, title: "When each row is recorded", text: "A rolling-shutter camera exposes its rows one after the other and a point scanner records them line by line, so the top and bottom of a frame are not taken at the same moment. For fast dynamics this mixes time into the vertical direction. A global shutter avoids it.",
      shows: [{ label: "ORCA, full chip at 100 frames/s", set: { camera: "orca", roi: 2048, binning: 4, diameter_um: 0.1, phi: 2e-5, frame_rate_hz: 100 }, go: "step-map" }, { label: "CB2, global shutter", set: { camera: "cb2", cam_mode: "b12", iface: "cxp", roi: 512, binning: 1, frame_rate_hz: 100, exposure_ms: 5.3 }, go: "step-map" }] },
    { lvl: 2, title: "Exposure time", text: "During a long exposure the particles keep moving, so the camera blurs the finest patterns before they are recorded. Their signal drops, most at high q.",
      shows: [{ label: "Show me", set: { exposure_ms: 50, frame_rate_hz: 20 }, go: "step-rates" }] },
    { lvl: 2, title: "Warmer or thicker liquid", text: "The particles move faster in warm water and slower in glycerol. The size comes out right only if the analysis uses the true temperature and viscosity.",
      shows: [{ label: "50 % glycerol", set: { liquid: "glycerol", glycerol_w: 0.5, frame_rate_hz: 20, exposure_ms: 1 }, go: "step-rates" }] },
    { lvl: 3, title: "Drift", text: "A slow flow carries every particle the same way. Rates then grow more slowly than q squared, the free exponent drops below 2 and the size comes out wrong.",
      shows: [{ label: "Show me", set: { drift_um_s: 3, diameter_um: 0.5, phi: 5e-4, frame_rate_hz: 50, exposure_ms: 1 }, go: "step-rates" }] },
    { lvl: 2, title: "Mixed sizes: mean size and polydispersity", text: "With a spread of sizes each curve is a sum of exponentials. As in dynamic light scattering, a cumulant fit gives a mean size and a polydispersity index (PI, 0 for identical particles), and a Schulz fit gives the same from the whole curve. Both are weighted toward the particles that show most in the images (a few large particles can carry much of the signal, so another field of view can differ by several percent), and that weight changes with q: the apparent size at each q is not flat, and the dashed line shows what the simulated particles should give.",
      shows: [{ label: "30 % spread (Schulz)", set: { diameter_um: 0.3, size_spread: 0.3, size_dist: "schulz", phi: 1e-3, fit_model: "schulz", frame_rate_hz: 50, exposure_ms: 1 }, go: "step-rates" }, { label: "50 % spread, stretched fit", set: { diameter_um: 0.3, size_spread: 0.5, size_dist: "schulz", phi: 1e-3, fit_model: "stretched", frame_rate_hz: 50, exposure_ms: 1 }, go: "step-rates" }] },
    { lvl: 2, title: "Particles that turn: polarized DDM", text: "Spheres of a birefringent material (here a polymerised liquid crystal) look the same from every side in ordinary light, so DDM sees only how they move. Between polarizers their brightness depends on how they are turned, and each pattern fades in two steps: D_T q\u00b2 from moving, and D_T q\u00b2 + 6 D_R where turning is added (Giavazzi, Haro-Perez and Cerbino 2016). From D_R the size follows a second time, independently. The Hyflon MFA spheres used by Degiorgio, Piazza, Bellini and colleagues for depolarized light scattering are a harder case: almost index matched, weakly birefringent and fast (6 D_R near 1400 s\u207b\u00b9). Crossed polarizers also pass a faster mode, 20 D_R, so the fit includes it; a bright lamp is needed at 4000 frames/s, and even then half a second of movie leaves D_R 25-40 % low.",
      shows: [{ label: "Polarizers at 75" + DEG + ", as in the paper", set: P_DDM(75), go: "step-rates" }, { label: "Crossed polarizers", set: P_DDM(90), go: "step-rates" }, { label: "No polarizers", set: Object.assign(P_DDM(75), { polarizer: "off", analyzer: "off" }), go: "step-rates" }, { label: "Hyflon MFA spheres, crossed, 4000 frames/s", set: MFA_SET(), go: "step-rates" }] },
    { lvl: 2, title: "Dark field sees bacteria tumble", text: "In dark field a rod scatters more or less light depending on how it is tilted, so it blinks as it tumbles. The blinking adds the same fast step, 6 D_R, at every q, whatever the optical contrast (Cerbino et al. 2018). The two-step model keeps only the slowest way of forgetting the orientation; rods with strongly tilt-dependent brightness also have faster ones, which here push D_R up by 10-20 %. Short movies of a few hundred cells leave a scatter of about 15 %.",
      shows: [{ label: "E. coli-like rods, Ph3 dark field, 10x", set: ECOLI("darkfield"), go: "step-rates" }, { label: "The same in bright field", set: ECOLI("brightfield"), go: "step-rates" }] },
    { lvl: 2, title: "Rotations in bright field: the squared gradient", text: "In bright field a turning particle mostly changes shape, not brightness, so plain DDM misses the rotation. Taking the squared gradient of every frame turns those changes of shape into changes of brightness (SG-DDM, Giavazzi, Pal and Cerbino 2021). Here peanut-like silica particles have settled onto the bottom of a 5 " + MU + "m cell, as in that work. Silica is not very heavy: the particles still bob up and down by about 0.7 " + MU + "m, and that axial motion lowers the measured D_R by a third or more. Heavier particles (the button with an assumed density of 4 g/cm" + SUP3 + ", closer to the hematite-core particles of the paper) stay within about 0.3 " + MU + "m of the glass and give D_R right.",
      shows: [{ label: "Squared gradient", set: PEANUT("squared_gradient"), go: "step-rates" }, { label: "Heavier particles, squared gradient", set: Object.assign(PEANUT("squared_gradient"), { particle: "custom", n_custom: 1.45, rho_custom: 4.0 }), go: "step-rates" }, { label: "Plain DDM", set: PEANUT("recorded"), go: "step-rates" }] },
    { lvl: 2, title: "Crowded samples", text: "The simulated particles ignore each other. In concentrated samples they collide and push each other through the liquid, and DDM measures this collective motion. That is useful for studying interactions, but it biases a size measurement.",
      shows: [], link: { href: "https://github.com/somexlab/fastddm-tutorials", text: "fastDDM tutorial 7 analyses protein interactions this way." } }
  ];
  function buildCards() {
    const host = $("cards");
    CARDS.forEach(function (c) {
      const el = document.createElement("article"); el.className = "card" + (c.lvl === 2 ? " lvl-2" : c.lvl === 3 ? " lvl-3" : "");
      const h = document.createElement("h3"); h.textContent = c.title; el.appendChild(h);
      const p = document.createElement("p"); p.textContent = c.text; el.appendChild(p);
      if (c.link) { const a = document.createElement("p"); a.innerHTML = '<a href="' + c.link.href + '"></a>'; a.querySelector("a").textContent = c.link.text; el.appendChild(a); }
      if (c.shows.length) {
        const b = document.createElement("div"); b.className = "btns";
        c.shows.forEach(function (s) {
          const btn = document.createElement("button"); btn.type = "button"; btn.textContent = s.label; if (s.lvl === 2) btn.className = "lvl-2";
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
          if (kind === "size") state.diameter_um = Math.min(5, state.diameter_um * 2);
          if (kind === "warm") state.T_C = 45;
          syncControls(); schedule();
        });
      });
    });
  }

  // ---- wiring -------------------------------------------------------------------------------
  buildControls(); buildCards(); buildPredictions();
  document.querySelectorAll('input[name="level"]').forEach(function (r) { r.addEventListener("change", function () { if (r.checked) setLevel(r.value, true); }); });
  document.querySelectorAll("[data-level-link]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); setLevel(a.getAttribute("data-level-link"), true); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }); });
  window.addEventListener("hashchange", function () { const h = location.hash.slice(1); if (LEVEL_RANK[h] && h !== level) setLevel(h, false); });
  $("btn-reset").addEventListener("click", function () { const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; document.querySelectorAll(".predict .a").forEach(function (a) { a.hidden = true; }); document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); }); constrain(); syncControls(); drawFov(); schedule(); });
  $("btn-seed").addEventListener("click", function () { state.seed = (state.seed * 1103515245 + 12345) % 2147483647; schedule(); });
  $("btn-play").addEventListener("click", function () { playing = !playing; $("btn-play").textContent = playing ? "Pause" : "Play"; });
  $("btn-play").textContent = playing ? "Pause" : "Play";
  $("lag").addEventListener("input", function () { if (!cache.res) return; renderLag(); drawDiff(frameIdx); drawMap(); });
  $("map-ov").addEventListener("click", onMapClick);
  $("view-change").addEventListener("click", function () { setCurveView("change"); });
  $("view-d").addEventListener("click", function () { setCurveView("d"); });
  $("btn-copy-report").addEventListener("click", function () {
    const txt = $("iso-report").textContent, btn = $("btn-copy-report");
    const fallback = function () { const r = document.createRange(); r.selectNodeContents($("iso-report")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Selected, press copy"; };
    try { navigator.clipboard.writeText(txt).then(function () { btn.textContent = "Copied"; }, fallback); } catch (e) { fallback(); }
  });
  $("btn-copy").addEventListener("click", function () {
    const txt = $("settings-json").textContent;
    const fallback = function () { const r = document.createRange(); r.selectNodeContents($("settings-json")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("btn-copy").textContent = "Selected, press copy"; };
    try { navigator.clipboard.writeText(txt).then(function () { $("btn-copy").textContent = "Copied"; }, fallback); } catch (e) { fallback(); }
  });
  let rz = null;
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawRates(); drawSize(); drawAmp(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const h0 = location.hash.slice(1);
  setLevel(LEVEL_RANK[h0] ? h0 : "curious", false);
  $("lag").value = 12;
  schedule();
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
    result: function () { return cache && cache.res ? { D: cache.res.D ? cache.res.D.D_um2_s : null, d: cache.res.diameter_um, rot: cache.res.rot && cache.res.rot.D_r_s ? cache.res.rot.D_r_s : null, reasons: cache.res.fits.map(function (f) { return f.reason; }) } : null; }
  };
})();
