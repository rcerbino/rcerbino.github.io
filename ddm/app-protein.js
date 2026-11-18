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
  // ---- the sample: proteins (protein.js) ------------------------------------------------------------------------
  // A protein is a hard sphere of its hydrodynamic radius with a net charge, screened by the salt, and a short-range
  // attraction. Presets: numbers from the literature where they exist; the attraction is set to match a reported k_D.
  const PROTEINS = {
    mab: { label: "An antibody (IgG, 148 kDa)", M_kDa: 148, Rh_nm: 5.3, Z: 12, eps_kT: 2.7, salt_mM: 15, conc: 8, c_max: 15,
      note: "A monoclonal antibody a little below its isoelectric point, so it carries a positive charge (12 charges, illustrative). The short-range attraction is set so that k_D comes out near -5 mL/g at 115 mM salt, close to a value reported by Laber et al. (2022)." },
    bsa: { label: "Albumin (BSA, 66 kDa)", M_kDa: 66.4, Rh_nm: 3.4, Z: -13, eps_kT: 0, salt_mM: 160, conc: 15, c_max: 30,
      note: "Bovine serum albumin in phosphate-buffered saline at pH 7.4, negatively charged. Radius as measured by DDM in our 2023 paper (Guidolin et al.), where k_D came out 4 +- 1 mL/g; with this charge the model gives 4.5." },
    lyso: { label: "Lysozyme (14 kDa)", M_kDa: 14.3, Rh_nm: 1.9, Z: 8, eps_kT: 3.8, salt_mM: 160, conc: 30, c_max: 40,
      note: "Hen egg-white lysozyme in saline at pH 7.4, positively charged. In this much salt its short-range attraction outweighs the charge a little: B2 slightly below zero. It is small, so each molecule scatters little light." },
    sticky: { label: "A sticky antibody (illustrative)", M_kDa: 148, Rh_nm: 5.3, Z: 12, eps_kT: 4.0, salt_mM: 115, conc: 8, c_max: 18,
      note: "An antibody with a stronger short-range attraction, as for those that tend to cluster: B2 below zero at 115 mM salt. The numbers are illustrative." },
    custom: { label: "Your own protein", note: "Set its mass, radius, charge and attraction below." }
  };
  const KB = 1.380649e-23;
  const VBAR = 0.73, DNDC = 0.185;        // partial specific volume (mL/g) and refractive index increment (mL/g) of proteins
  const DELTA_NM = 0.3;                   // range of the short-range attraction
  function proteinSpec() {
    const p = state.protein === "custom" ? { M_kDa: state.M_kDa, Rh_nm: state.Rh_nm } : PROTEINS[state.protein];
    return { M_kDa: p.M_kDa, Rh_nm: p.Rh_nm, Z: state.Z, eps_kT: state.eps_kT };
  }
  function props() {
    const p = proteinSpec();
    return PROTEIN.properties({ M_g_mol: p.M_kDa * 1000, Rh_nm: p.Rh_nm, Z: p.Z, I_mM: state.salt_mM, eps_kT: p.eps_kT, delta_nm: DELTA_NM, T_C: state.T_C, eta_Pa_s: viscosity_mPa_s() * 1e-3 });
  }
  // a new protein brings its own charge, attraction, salt and concentrations; "your own" starts from the protein before
  function applyProtein(prev) {
    const p = PROTEINS[state.protein];
    if (state.protein === "custom") { const q = PROTEINS[prev] && prev !== "custom" ? PROTEINS[prev] : PROTEINS.mab; state.M_kDa = q.M_kDa; state.Rh_nm = q.Rh_nm; return; }
    ["Z", "eps_kT", "salt_mM", "conc", "c_max"].forEach(function (k) { state[k] = p[k]; });
  }
  // the concentrations of a series: from 15 % to 100 % of the highest
  const SERIES_FRACTIONS = [0.15, 0.3, 0.5, 0.75, 1];
  function seriesList() { return SERIES_FRACTIONS.map(function (f) { return Math.round(10 * f * state.c_max) / 10; }); }
  function fmtA2(v) { return Number.isFinite(v) ? v.toExponential(2) : "-"; }
  function proteinHint() {
    const p = PROTEINS[state.protein], r = props();
    return (p ? p.note + " " : "") + (level === "curious" ? "Alone, it would spread by diffusion with D0 = " + fmtSig(r.D0_um2_s, 3) + " " + MU + "m\u00b2/s." :
      "Hydrodynamic radius " + fmtSig(r.Rh_nm, 2) + " nm: alone it diffuses with D0 = " + fmtSig(r.D0_um2_s, 3) + " " + MU + "m\u00b2/s (Stokes-Einstein).");
  }
  function interWord(r) {
    const hs = r.A2_hard_mol_mL_g2, a = r.A2_mol_mL_g2;
    return a < 0 ? "the proteins attract each other" : a < 0.85 * hs ? "an attraction partly offsets their size" : a > 1.15 * hs ? "the proteins repel each other" : "they behave almost like hard spheres";
  }
  function interHint() {
    const r = props();
    let h = "Screening length (Debye length) " + fmtSig(r.debye_nm, 2) + " nm: the charges feel each other over about that distance. ";
    if (level === "curious") return h + "Here " + interWord(r) + ".";
    h += "Pair potential at contact " + fmtSig(r.U_contact_kT, 2) + " kT. A2 = B2 N_A / M\u00b2 = " + fmtA2(r.A2_mol_mL_g2) + " mol mL/g\u00b2 (hard spheres of this size: " + fmtA2(r.A2_hard_mol_mL_g2) + "): " + interWord(r) + ". k_D = " + fmtSig(r.kD_mL_g, 2) + " mL/g.";
    return h;
  }
  function concHint() {
    const r = props(), c = state.conc;
    let h = level === "curious" ? "At this concentration the proteins spread " + (r.kD_mL_g >= 0 ? fmtSig(100 * (r.Dc(c) / r.D0_um2_s - 1), 2) + " % faster" : fmtSig(100 * (1 - r.Dc(c) / r.D0_um2_s), 2) + " % more slowly") + " than one alone would." :
      "D_c = D0 (1 + k_D c) = " + fmtSig(r.Dc(c), 3) + " " + MU + "m\u00b2/s, S(0) = " + fmtSig(r.S0(c), 3) + "; volume fraction " + fmtSig(100 * r.volumeFraction(c), 2) + " %.";
    if (!r.firstOrderOK(c)) h += " At this concentration the first-order description used here is stretched: lower it.";
    return h;
  }
  function seriesHint() {
    const r = props(), cm = state.c_max;
    return "The series records " + seriesList().join(", ") + " mg/mL, " + state.repeats + (state.repeats === 1 ? " movie" : " movies") + " each: about " + fmtDur(seriesSeconds()) + "." + (r.firstOrderOK(cm) ? "" : " At the highest concentration the first-order description is stretched: lower it.");
  }
  // the standard sample: the antibody at 8 mg/mL in a low-salt buffer (15 mM), bright field through a 20x NA 0.5 objective with
  // the condenser closed to NA 0.1, ORCA-Flash4.0 binned 2 x 2 at 500 frames/s, four movies of 512 frames
  const BASE = {
    mode: "brightfield", protein: "mab", M_kDa: 148, Rh_nm: 5.3, Z: 12, eps_kT: 2.7, salt_mM: 15, conc: 8, c_max: 15, repeats: 4,
    liquid: "water", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 100, focus_frac: 0.5,
    objective: objIndexByName("CFI Plan Fluor 20X"), condenser: "elwd", na_c: 0.1, source: "green", annulus: "Ph2", light_frac: 0.7,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 2, roi: 256, sim_px: 128, n_frames: 512,
    frame_rate_hz: 500, exposure_ms: 1.99, frame_timing: "even", log_factor: 1, scan_px: 512, zoom: 1, scanner: "resonant", dye: "green",
    q_min: null, q_max: null, seed: 1, x_depth: "on", x_expo: "on", x_fixD: "on"
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
  // the movie is a density field (field-movie.js): its cost grows with the pixels and the frames (about 1.9 s for
  // 128 x 128 x 512 in our tests), the analysis adds about a third
  function simPx() { return Math.min(state.sim_px, outPx()); }
  function nFrames() { return Math.min(state.n_frames, maxFrames(simPx())); }
  function movieSeconds() { const n = simPx(); return 2.6 * n * n * nFrames() / 8.4e6 + 0.3; }
  function simSeconds() { return state.repeats * movieSeconds() + 1; }
  function seriesSeconds() { return SERIES_FRACTIONS.length * simSeconds(); }
  const MAX_SECONDS = 180, MAX_SERIES_SECONDS = 900;
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
  function fmtDur(s) { return s < 120 ? fmtTime(s) : s < 7200 ? fmtSig(s / 60, 2) + " min" : fmtSig(s / 3600, 2) + " h"; }
  function liquidSpec() {
    if (state.liquid === "water") return { glycerol_w: 0 };
    if (state.liquid === "glycerol") return { glycerol_w: state.glycerol_w };
    return { n: state.n_liquid, viscosity_mPa_s: state.visc_mPa_s, density_g_cm3: state.rho_liquid };
  }
  function viscosity_mPa_s() { const l = liquidSpec(); return l.viscosity_mPa_s !== undefined ? l.viscosity_mPa_s : OPTICS.viscosityWaterGlycerol_mPa_s(l.glycerol_w, state.T_C); }
  function nLiquid(l0) { return OPTICS.liquidIndex(liquidSpec(), l0); }
  function centralWavelength() { if (!TRANS()) return DYES[state.dye].em; const sp = OPTICS.SOURCES[state.source].sample(); return sp.reduce(function (s, p) { return s + p.w * p.l; }, 0); }
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
  // immersion index; multi-immersion objectives are taken as set for the liquid (no aberration)
  const IMMERSION = { dry: 1.0, oil: 1.518, water: 1.333, silicone: 1.406 };
  function immersionIndex(ob, lam) { return ob.im === "multi" ? nLiquid(lam) : IMMERSION[ob.im]; }
  // what the movie needs of the proteins at a concentration c (mg/mL): their image (a sphere of their dry volume and index),
  // how many there are, S(0) and D_c
  function proteinField(c) {
    const r = props(), p = proteinSpec(), lam = centralWavelength();
    return { diameter_um: 2 * PROTEIN.volumeRadiusNm(p.M_kDa * 1000, VBAR) / 1000, n: PROTEIN.proteinIndex(nLiquid(lam), DNDC, VBAR),
      number_density_um3: r.numberDensity_um3(c), S0: r.S0(c), Dc_um2_s: r.Dc(c) };
  }
  function simConfig(c) {
    const ob = objective(), lam = centralWavelength();
    return {
      seed: state.seed, mode: "brightfield", objective: { mag: ob.m, na: ob.na, n_imm: immersionIndex(ob, lam) },
      illum: illumination(), source: state.source, light_frac: state.light_frac,
      detector: detectorConfig(), n_px: simPx(), n_frames: nFrames(),
      frame_rate_hz: state.frame_rate_hz, exposure_s: state.exposure_ms / 1000,
      liquid: liquidSpec(), T_C: state.T_C, cell_um: state.cell_um, focus_um: state.focus_frac * state.cell_um,
      protein: proteinField(c === undefined ? state.conc : c)
    };
  }
  function analysisOptions() {
    return { q_min_per_um: state.q_min, q_max_per_um: state.q_max, amp_q: [0.6, 2.5], depth: state.x_depth !== "off", exposure: state.x_expo !== "off", fix_D: state.x_fixD !== "off", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "protein", lvl: 1, label: "Protein", kind: "select", options: Object.keys(PROTEINS).map(function (k) { return [k, PROTEINS[k].label]; }), hint: proteinHint },
    { key: "M_kDa", lvl: 1, label: "Molar mass", kind: "log", entry: { unit: "kDa", scale: 1, step: 0.1, digits: 1 }, min: 5, max: 1000, fmt: function (v) { return fmtSig(v, 3) + " kDa"; }, when: function () { return state.protein === "custom"; } },
    { key: "Rh_nm", lvl: 1, label: "Hydrodynamic radius", kind: "log", entry: { unit: "nm", scale: 1, step: 0.1, digits: 2 }, min: 1, max: 20, fmt: function (v) { return fmtSig(v, 3) + " nm"; }, when: function () { return state.protein === "custom"; },
      hint: function () { const rv = PROTEIN.volumeRadiusNm(state.M_kDa * 1000, VBAR); return "A compact protein of this mass is about " + fmtSig(rv, 2) + " nm in radius without its water; the hydrodynamic radius is usually 1.2-1.5 times that" + (state.Rh_nm < rv ? ": this one is smaller than the protein itself." : "."); } },
    { key: "Z", lvl: 1, label: "Net charge", kind: "lin", entry: { unit: "charges", scale: 1, step: 1, digits: 0 }, min: -40, max: 40, step: 1, fmt: function (v) { return (v > 0 ? "+" : "") + Math.round(v); },
      hint: function () { return level === "curious" ? "Proteins of the same charge repel each other; only its size counts, not its sign." : "Elementary charges per protein; it changes with the pH. Only Z\u00b2 enters the repulsion between two equal proteins."; } },
    { key: "salt_mM", lvl: 1, label: "Salt (ionic strength)", kind: "log", entry: { unit: "mM", scale: 1, step: 1, digits: 0 }, min: 1, max: 1000, fmt: function (v) { return fmtSig(v, 3) + " mM"; }, hint: interHint },
    { key: "eps_kT", lvl: 2, label: "Attraction at contact", kind: "lin", entry: { unit: "kT", scale: 1, step: 0.1, digits: 1 }, min: 0, max: 6, step: 0.1, fmt: function (v) { return fmtSig(v, 2) + " kT"; },
      hint: function () { return "Sticky patches, van der Waals forces and hydrophobic contacts, lumped into an attraction that fades over " + DELTA_NM + " nm."; } },
    { key: "conc", lvl: 1, label: "Concentration", kind: "log", entry: { unit: "mg/mL", scale: 1, step: 0.1, digits: 1 }, min: 0.5, max: 60, fmt: function (v) { return fmtSig(v, 3) + " mg/mL"; }, hint: concHint },
    { key: "c_max", lvl: 1, label: "Series up to (step 7)", kind: "log", entry: { unit: "mg/mL", scale: 1, step: 0.1, digits: 1 }, min: 2, max: 60, fmt: function (v) { return fmtSig(v, 3) + " mg/mL"; }, hint: seriesHint },
    { key: "repeats", lvl: 2, label: "Movies per concentration", kind: "select", num: true, options: [[1, "1"], [2, "2"], [4, "4"], [8, "8"]],
      hint: function () { return "Movies of the same sample, analysed together: the uncertainty shrinks as one over the square root of their number. About " + fmtDur(simSeconds()) + " for the bench."; } },
    { key: "liquid", lvl: 2, label: "Liquid", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; }, hint: function () { return "Viscosity " + fmtSig(viscosity_mPa_s(), 2) + " mPa s at " + Math.round(state.T_C) + " " + DEG + "C."; } },
    { key: "n_liquid", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, entry: { unit: DEG + "C", scale: 1, step: 1, digits: 0 }, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", lvl: 2, label: "Chamber thickness", kind: "log", min: 10, max: 300, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return "All proteins in the chamber add to the image, in focus or not: a thicker chamber holds more of them."; } },
    { key: "focus_frac", lvl: 2, label: "Focus height in the chamber", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },

    { key: "objective", lvl: 1, label: "Objective", kind: "objective", hint: objectiveHint },
    { key: "condenser", lvl: 2, label: "Condenser lens", kind: "select", options: Object.keys(CONDENSERS).map(function (k) { return [k, CONDENSERS[k].label]; }) },
    { key: "na_c", lvl: 1, label: "Aperture diaphragm (condenser NA)", kind: "lin", min: 0.01, max: 1.4, step: 0.01, fmt: function (v) { return Math.min(v, CONDENSERS[state.condenser].na).toFixed(2); },
      hint: function () { const nc = Math.min(state.na_c, CONDENSERS[state.condenser].na); return nc > objective().na ? "Wider than the objective: part of the light misses it (towards dark field)." : "Closed down, the light is more coherent: proteins far from focus still show, and the patterns are stronger."; } },
    { key: "source", lvl: 2, label: "Light source", kind: "select", options: Object.keys(OPTICS.SOURCES).map(function (k) { return [k, OPTICS.SOURCES[k].label]; }) },
    { key: "light_frac", lvl: 2, label: "Lamp brightness (background as a share of the full well)", kind: "log", min: 0.002, max: 0.9, fmt: function (v) { return fmtSig(100 * v, 2) + " %"; }, hint: function () { const fw = detFullWell(); return "Background " + Math.round(state.light_frac * fw) + " electrons per pixel; shot noise " + fmtSig(100 / Math.sqrt(state.light_frac * fw), 2) + " %. The proteins change the light by far less than that."; } },

    { key: "camera", lvl: 1, label: "Camera", kind: "select", options: Object.keys(CAMERAS).map(function (k) { return [k, CAMERAS[k].label]; }) },
    { key: "cam_mode", lvl: 2, label: "Camera mode", kind: "select", options: function () { const c = cam(); return Object.keys(c.modes).map(function (k) { return [k, c.modes[k].label]; }); } },
    { key: "iface", lvl: 3, label: "Interface", kind: "select", options: function () { const c = cam(); return Object.keys(c.ifaces).map(function (k) { return [k, c.ifaces[k]]; }); } },
    { key: "roi", lvl: 2, label: "Region of interest on the sensor", kind: "select", num: true, options: function () { const c = cam(); return c.rois.map(function (r) { return [r, r + " x " + r + (r === c.rows ? " (full height)" : "")]; }); } },
    { key: "binning", lvl: 2, label: "Binning", kind: "select", num: true, options: function () { return allowedBins().map(function (b) { return [b, b + " x " + b + (cam().bin_charge && b > 1 ? " (on chip)" : "")]; }); }, hint: binHint },
    { key: "frame_rate_hz", lvl: 1, label: "Frame rate", kind: "log", min: 0.5, max: 30000, fmt: function (v) { return fmtNum(v) + " frames/s"; }, hint: function () { return "Up to " + fmtNum(maxFps()) + " frames/s with these settings. Proteins are fast: the patterns used fade within a few to a hundred milliseconds."; } },
    { key: "exposure_ms", lvl: 2, label: "Exposure time", kind: "log", min: 0.01, max: 2000, fmt: function (v) { return fmtSig(v, 2) + " ms"; }, hint: function () { const t = minExposureMs(); return (t > 0 ? "At least " + fmtSig(t, 2) + " ms here. " : "") + "The camera averages the proteins' motion over the exposure; the analysis takes that into account."; } },
    { key: "n_frames", lvl: 2, label: "Number of frames per movie", kind: "select", num: true, options: [[128, "128"], [256, "256"], [512, "512"], [1024, "1024"], [2048, "2048"]],
      hint: function () { return "The browser holds up to " + maxFrames(simPx()) + " frames at " + simPx() + " x " + simPx() + " pixels; asking for more makes the simulated image smaller."; } },
    { key: "sim_px", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]],
      hint: function () { return "About " + fmtSig(movieSeconds(), 2) + " s per movie."; } },
    { key: "qrange", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // "Addict": the additions to the published method, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_depth", lvl: 4, label: "Motion along the axis of the microscope", kind: "select", options: ONOFF("one exponential per q, as in the plain method"),
      hint: function () { return "On: each pattern of the image collects proteins over the depth in focus, and they also move along the axis, so f(q, \u0394t) is a weighted sum of exponentials with rates D_c (q\u00b2 + k\u00b2), weights from the optics. Off: f = exp(-D_c q\u00b2 \u0394t)."; } },
    { key: "x_expo", lvl: 4, label: "Averaging over the exposure", kind: "select", options: ONOFF("each frame taken as an instant"),
      hint: function () { return "On: the camera averages each frame over its exposure, which softens the fastest patterns; the model does the same. Off: frames are taken as instants."; } },
    { key: "x_fixD", lvl: 4, label: "Amplitudes at the diffusion coefficient of the line", kind: "select", options: ONOFF("each amplitude from its own fit"),
      hint: function () { return "On (step 7): after the line through D_c, each amplitude is fitted again with D fixed on the line, so the noise of its own D does not leak into it. Off: the amplitudes from the fits of step 6."; } }
  );
  // where each control sits: the sample, the light reaching it, and how the light is collected and recorded. Every
  // control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Sample", [
      ["The proteins", ["protein", "M_kDa", "Rh_nm", "Z", "eps_kT"]],
      ["Buffer and temperature", ["salt_mM", "liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "T_C"]],
      ["How much", ["conc", "c_max", "repeats"]],
      ["Chamber", ["cell_um", "focus_frac"]]]],
    ["Microscope (Nikon Ti2-E)", [
      ["Bright field", ["objective", "source", "condenser", "na_c", "light_frac"]]]],
    ["Camera and recording", [
      ["", ["camera", "cam_mode", "iface", "roi", "binning"]],
      ["Timing", ["frame_rate_hz", "exposure_ms", "n_frames", "sim_px"]]]],
    ["Analysis", [
      ["", ["qrange"]],
      ["Addict: what this page adds", ["x_depth", "x_expo", "x_fixD"]]]]
  ];
  // one-line summary under each block title: [setting, text before, text after]
  const SUMMARY = {
    "Sample": [["protein"], ["conc", "at "], ["salt_mM", "", " salt"]],
    "Microscope (Nikon Ti2-E)": [["objective"], ["na_c", "condenser NA "]],
    "Camera and recording": [["camera"], ["frame_rate_hz"], ["n_frames", "", " frames"]],
    "Analysis": []
  };
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (sb) { sb[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; c.sub = sb[0]; out.push(c); delete byKey[k]; }); }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, x_depth: 1, x_expo: 1, x_fixD: 1 };
  function fmtRate(v) { return fmtSig(v, 2) + " s" + "\u207b\u00b9"; }
  // binning factors the camera allows in the chosen mode (the CB2 cannot bin in 16-bit HDR)
  function allowedBins() {
    const c = cam();
    return c.bins.filter(function (b) { return b === 1 || state.camera !== "cb2" || !!c.modes[state.cam_mode].bin[c.ifaces[state.iface] ? state.iface : "cxp"]; });
  }
  function detFullWell() { const c = cam(), m = c.modes[state.cam_mode]; return c.bin_charge ? m.fw : m.fw * state.binning * state.binning; }
  function objectiveHint() {
    const o = objective(), lam = centralWavelength(), nl = nLiquid(lam);
    const parts = [o.s + ". Pixel " + fmtSig(pixelUm(), 3) + " " + MU + "m at the sample."];
    if (o.na > nl) parts.push("In this liquid only NA " + nl.toFixed(2) + " can be used (light beyond it is totally reflected at the cover glass).");
    const ni = immersionIndex(o, lam), dF = state.focus_frac * state.cell_um;
    if (Math.abs(ni - nl) > 1e-3 && dF > 0) parts.push("Immersion index " + ni.toFixed(3) + ", liquid " + nl.toFixed(3) + ": focusing " + fmtSig(dF, 2) + " " + MU + "m into the chamber adds spherical aberration (included; correction collar taken as set for a standard cover glass).");
    if (o.ph) parts.push("Phase ring " + o.ph + ": not simulated (bright field without it).");
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
  function binHint() {
    if (allowedBins().length < cam().bins.length) return "This camera mode does not allow binning; choose a 12, 10 or 8 bit mode to bin 2 x 2.";
    return state.binning > 1 ? "Each image pixel sums " + state.binning * state.binning + " pixels of the sensor: more light per pixel and a wider field for the same simulated pixels, but coarser stripes only." : "";
  }
  // keep settings physically possible: frame rate within the camera limit, exposure within a frame, the movie in memory
  function constrain() {
    const c = cam();
    if (!c.modes[state.cam_mode]) state.cam_mode = Object.keys(c.modes)[0];
    if (!c.ifaces[state.iface]) state.iface = Object.keys(c.ifaces)[0];
    if (c.rois.indexOf(state.roi) < 0) state.roi = c.rois.filter(function (r) { return r <= 512; })[0] || c.rois[c.rois.length - 1];
    if (allowedBins().indexOf(state.binning) < 0) state.binning = 1;
    let f = maxFps();
    const tmin = minExposureMs();
    if (tmin > 0) f = Math.min(f, 1000 / tmin);
    if (state.frame_rate_hz > f) state.frame_rate_hz = f;
    if (state.exposure_ms > 1000 / state.frame_rate_hz) state.exposure_ms = 1000 / state.frame_rate_hz;
    if (state.exposure_ms < tmin) state.exposure_ms = tmin;
    if (state.sim_px > outPx()) state.sim_px = Math.max(32, outPx());
    // memory limit (pixels x frames): the setting the reader changed last wins
    if (state.n_frames > maxFrames(simPx())) {
      if (lastKey === "n_frames") { while (state.sim_px > 32 && state.n_frames > maxFrames(simPx())) state.sim_px /= 2; }
      if (state.n_frames > maxFrames(simPx())) state.n_frames = [2048, 1024, 512, 256, 128].filter(function (n) { return n <= maxFrames(simPx()); })[0] || 128;
    }
  }
  let lastKey = null;
  function onChange(key) {
    lastKey = key; compare = null;
    if (key === "protein") applyProtein(prevProtein);
    prevProtein = state.protein;
    if (key === "camera") { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; state.binning = 1; }
    resetPredictions();
    constrain(); syncControls(); drawFov();
    if (cache.res) drawSeries();
    if (ANALYSIS_KEYS[key]) scheduleAnalysis(); else if (key !== "c_max") schedule();
  }
  let prevProtein = BASE.protein;

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
  // the bench: R movies at the concentration on the bench, analysed together; the series (step 7): R new movies at each of
  // five concentrations, with the lines through them
  const cache = { movie: null, res: null, cfg: null, opts: null, series: null };
  let timer = null, worker = null, runToken = 0, workerOK = true, seriesQueued = false;
  function workerSource() {
    return ["optics-src", "field-src", "engine-src", "protein-src", "pengine-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
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
  // the settings a series depends on: everything but the concentration on the bench
  function seriesKey() { const s = Object.assign({}, state); delete s.conc; return JSON.stringify(s); }
  function seriesValid() { return !!(cache.series && cache.series.key === seriesKey()); }
  function onMessage(ev) {
    const m = ev.data; if (m.token !== runToken) return;
    if (m.type === "progress") progress(m.frac, m.stage);
    else if (m.type === "error") { inflight = null; seriesQueued = false; showError(m.message); }
    else if (m.type === "done") { const k = inflight; inflight = null; finish(m.movie || cache.movie, m.res, m.movie ? pending.cfg : cache.cfg, pending.opts, k); }
    else if (m.type === "series") { inflight = null; finishSeries(m.points, m.fit, m.published, pending); }
  }
  let pending = {};
  function ensureWorker(busy) {
    if (worker && busy) { worker.terminate(); worker = null; }
    if (workerOK && !worker) worker = makeWorker();
    if (worker) {
      worker.onmessage = onMessage;
      worker.onerror = function (e) { e.preventDefault(); workerOK = false; worker = null; if (pending.kind === "series") startSeries(); else start(pending.kind === "analyse" && !cache.movie ? "simulate" : pending.kind); };
    }
    return worker;
  }
  function start(kind) {
    // a setup that would keep the browser busy for minutes is not started
    if (kind === "simulate" && simSeconds() > MAX_SECONDS) { ++runToken; inflight = null; showError("this setup would take about " + Math.round(simSeconds() / 60) + " minutes to simulate in the browser: use fewer movies per concentration, fewer frames or a smaller simulated image."); return; }
    if (kind === "analyse" && inflight === "simulate") kind = "simulate";   // the worker's movie would not match the page's
    const token = ++runToken, busy = inflight !== null;
    inflight = kind;
    $("error").hidden = true;
    pending = { kind: kind, cfg: simConfig(), opts: analysisOptions() };
    if (ensureWorker(busy)) worker.postMessage({ type: kind, token: token, cfg: pending.cfg, R: state.repeats, opts: pending.opts });
    else runHere(kind, token, pending.cfg, pending.opts);
  }
  // the concentration series: started at once, or as soon as the bench has finished
  function startSeries() {
    if (inflight === "simulate" || inflight === "analyse") { seriesQueued = true; $("series-msg").textContent = "The series starts as soon as the bench has finished."; return; }
    seriesQueued = false;
    if (seriesSeconds() > MAX_SERIES_SECONDS) { showError("this series would take about " + Math.round(seriesSeconds() / 60) + " minutes in the browser: use fewer movies per concentration or fewer frames."); return; }
    const token = ++runToken, busy = inflight !== null, r = props(), list = seriesList();
    inflight = "series"; $("error").hidden = true;
    pending = { kind: "series", key: seriesKey(), list: list, opts: analysisOptions(), props: r, label: seriesLabel() };
    // each concentration its own random sample (seeds apart), so that the points of the series are independent
    const cfgs = list.map(function (c, i) { return Object.assign(simConfig(c), { seed: (state.seed + 104729 * (i + 1)) % 4294967295 }); });
    if (ensureWorker(busy)) worker.postMessage({ type: "series", token: token, list: list, cfgs: cfgs, R: state.repeats, opts: pending.opts, M: r.M_g_mol, T_C: state.T_C, eta: viscosity_mPa_s() * 1e-3 });
    else seriesHere(token, list, cfgs, pending);
    $("series-msg").textContent = "Running: about " + fmtDur(seriesSeconds()) + ".";
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
  let moviesHere = null;
  async function sampleHere(cfg, R, opts, token, a, b, pre) {
    const mv = [];
    for (let k = 0; k < R; k++) { const m = await drive(FIELD.simulate(Object.assign({}, cfg, { seed: cfg.seed + 7919 * k })), token, a + (b - a) * 0.7 * k / R, a + (b - a) * 0.7 * (k + 1) / R, (pre || "") + (R > 1 ? "Movie " + (k + 1) + " of " + R + ": " : "")); if (!m) return null; mv.push(m); }
    const res = await drive(PROTEIN_ENGINE.analyse(mv, opts), token, a + (b - a) * 0.7, opts.compare_published ? a + (b - a) * 0.85 : b, pre); if (!res) return null;
    if (opts.compare_published) { const rp = await drive(PROTEIN_ENGINE.analyse(mv, Object.assign({}, opts, { published_only: true })), token, a + (b - a) * 0.85, b, pre); res.published = rp && rp.D_um2_s ? { D_um2_s: rp.D_um2_s, D_rel_err: rp.D_rel_err, A_mean: rp.A_mean, A_rel_err: rp.A_rel_err } : { failed: "too little to work with" }; }
    return { movies: mv, res: res };
  }
  async function runHere(kind, token, cfg, opts) {
    let res;
    if (kind === "simulate" || !moviesHere) { const s = await sampleHere(cfg, state.repeats, opts, token, 0, 1); if (!s) return; moviesHere = s.movies; res = s.res; }
    else { res = await drive(PROTEIN_ENGINE.analyse(moviesHere, opts), token, 0, 1); if (!res) return; }
    inflight = null;
    finish(moviesHere[0], res, kind === "simulate" ? cfg : cache.cfg, opts, kind);
  }
  async function seriesHere(token, list, cfgs, p) {
    const pts = [], kept = [], pub = [];
    for (let i = 0; i < list.length; i++) {
      const s = await sampleHere(cfgs[i], state.repeats, p.opts, token, i / list.length, (i + 1) / list.length, list[i] + " mg/mL: "); if (!s) return;
      const tA = s.movies[0].truth.amplitude, ar = s.res.rows.filter(function (x) { return x.q_per_um >= s.res.amp_q[0] && x.q_per_um <= s.res.amp_q[1] && x.A !== undefined; });
      pts.push({ c: list[i], D: s.res.D_um2_s, D_rel_err: s.res.D_rel_err, A: s.res.A_mean, A_rel_err: s.res.A_rel_err, A_true: ar.length ? ar.reduce(function (q, x) { return q + tA.A[x.b]; }, 0) / ar.length : null, n_used: s.res.rows.filter(function (x) { return x.used; }).length });
      if (s.res.published && !s.res.published.failed) pub.push({ c: list[i], D: s.res.published.D_um2_s, D_rel_err: s.res.published.D_rel_err, A: s.res.published.A_mean, A_rel_err: s.res.published.A_rel_err });
      kept.push(s.res);
    }
    const r = p.props, eta = viscosity_mPa_s() * 1e-3;
    let fit = PROTEIN_ENGINE.series(pts, r.M_g_mol, state.T_C, eta);
    if (fit.lineD && p.opts.fix_D !== false) { pts.forEach(function (q, i) { const a = PROTEIN_ENGINE.amplitudeAt(kept[i], fit.lineD.a + fit.lineD.b * q.c); if (a) { q.A = a.A; q.A_rel_err = a.rel_err; } }); fit = PROTEIN_ENGINE.series(pts, r.M_g_mol, state.T_C, eta); }
    const fitPub = p.opts.compare_published ? (pub.length >= 2 ? PROTEIN_ENGINE.series(pub, r.M_g_mol, state.T_C, eta) : { failed: "too little to work with" }) : null;
    inflight = null;
    finishSeries(pts, fit, fitPub, p);
  }
  function finish(movie, res, cfg, opts, kind) {
    document.querySelector(".steps").classList.remove("stale");
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    // a new movie: the delay slider where the patterns in the middle of those used are half renewed, and the lower map
    // zoomed on the patterns used
    if (fresh) {
      const used = res.rows.filter(function (r) { return r.used; }), mid = used[Math.floor(used.length / 2)];
      const tw = (mid && halfTime(mid)) || Math.sqrt(res.taus_s[0] * res.taus_s[res.taus_s.length - 1]), ta = res.taus_s;
      let li = 0; for (let k = 0; k < ta.length; k++) if (Math.abs(Math.log(ta[k] / tw)) < Math.abs(Math.log(ta[li] / tw))) li = k;
      $("lag").max = ta.length - 1; $("lag").value = li;
      const qz = res.window.q_max_used || res.window.q_hi_per_um || 3;
      cache.zoomK = Math.max(8, Math.min(movie.n / 2 - 1, Math.round(qz * movie.L_um / (2 * Math.PI)) + 2));
    }
    $("btn-times").hidden = true;
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + res.repeats + (res.repeats === 1 ? " movie" : " movies") + " of " + movie.T + " frames, " + movie.n + " x " + movie.n + " pixels, about " + fmtCount(movie.truth.n_proteins) + " proteins in the simulated volume."; idle();
    frameIdx = 0; playT = 0;
    renderAll();
    if (seriesQueued) startSeries();
  }
  function finishSeries(points, fit, published, p) {
    cache.series = { key: p.key, list: p.list, points: points, fit: fit, published: published, props: p.props, label: p.label };
    $("bar").style.width = "100%"; idle();
    $("status").textContent = "Series done: " + points.length + " concentrations, " + state.repeats + (state.repeats === 1 ? " movie" : " movies") + " each.";
    $("series-msg").textContent = "";
    drawSeries(); if (cache.res) renderResult();
  }
  function fmtCount(n) { return n >= 1e12 ? fmtSig(n / 1e12, 2) + " million million" : n >= 1e9 ? fmtSig(n / 1e9, 2) + " billion" : n >= 1e6 ? fmtSig(n / 1e6, 2) + " million" : String(Math.round(n)); }

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
  // ---- one protein, through focus (from the computed kernel) ----------------------------
  function drawParticle() {
    const info = cache.movie.info, Kk = info.kernel, q = info.kernel_q, z = Kk.z_um, nz = z.length, nq = q.length;
    const host = $("particle-strip"); host.innerHTML = "";
    const want = [-20, -10, 0, 10, 20].map(function (v) { return v * Math.max(0.5, Math.min(2, centralWavelength() / objective().na / 1.1)); });
    const a = pixelUm() / 2, Npx = 41, half = (Npx - 1) / 2, dq = q[1] - q[0];   // drawn at half the camera pixel
    const imgs = []; let vmax = 0;
    want.forEach(function (zw) {
      const zf = zw;   // focus at z = 0
      if (zf < z[0] || zf > z[nz - 1]) { imgs.push(null); return; }
      let iz = 0; for (let j = 0; j < nz; j++) if (Math.abs(z[j] - zf) < Math.abs(z[iz] - zf)) iz = j;
      // rotationally symmetric: inverse Hankel transform I(r) = (1 / 2 pi) int K(q) J0(q r) q dq
      const I = new Float64Array(Npx * Npx), rmax = half * a * Math.SQRT2, NR = 64, P = new Float64Array(NR + 1);
      for (let ir = 0; ir <= NR; ir++) { const r = rmax * ir / NR; let sum = 0; for (let iq = 0; iq < nq; iq++) sum += Kk.Kr[iq * nz + iz] * OPTICS.besselJ0(q[iq] * r) * q[iq]; P[ir] = sum * dq / (2 * Math.PI); }
      for (let y = 0; y < Npx; y++) for (let x = 0; x < Npx; x++) { const t = Math.hypot(x - half, y - half) * a / rmax * NR, i = Math.min(NR - 1, Math.floor(t)), f = t - i; I[y * Npx + x] = P[i] + f * (P[i + 1] - P[i]); }
      for (let p = 0; p < I.length; p++) vmax = Math.max(vmax, Math.abs(I[p]));
      imgs.push({ z: z[iz], I: I });
    });
    imgs.forEach(function (p) {
      const fig = document.createElement("figure"); fig.className = "pz";
      const cv = document.createElement("canvas"); cv.width = Npx; cv.height = Npx; cv.setAttribute("aria-hidden", "true");
      const cap = document.createElement("figcaption");
      if (p) {
        const ctx = cv.getContext("2d"), img = ctx.createImageData(Npx, Npx), d = img.data;
        for (let k = 0; k < Npx * Npx; k++) { const g = 128 + 120 * p.I[k] / (vmax || 1); d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = Math.max(0, Math.min(255, g)); d[4 * k + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        cap.textContent = Math.abs(p.z) < 1e-6 ? "in focus" : fmtSig(Math.abs(p.z), 2) + " " + MU + "m " + (p.z < 0 ? "above" : "below");
      } else cap.textContent = "outside the cell";
      fig.appendChild(cv); fig.appendChild(cap); host.appendChild(fig);
    });
    // the largest change of a pixel's brightness caused by one protein, as a share of the background
    const peak = vmax * pixelUm() * pixelUm();
    $("particle-text").textContent = "Each picture is the light a single protein changes, computed for a sphere of its dry volume (refractive index " + PROTEIN.proteinIndex(nLiquid(centralWavelength()), DNDC, VBAR).toFixed(3) + ") with the optics of the microscope. Grey is the background, and the contrast is stretched until the protein shows: alone, it changes the light reaching a pixel by at most a fraction " + fmtPhi(peak) + ". The movie sees the proteins only because there are " + fmtCount(cache.movie.truth.n_proteins) + " of them in the chamber below the simulated field.";
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
    txt += !near ? ". Outside the patterns used (too faint against the camera noise)" : th ? ". The proteins renew half of it in about <b>" + fmtTime(th) + "</b>" : rows[rk].f && rows[rk].f[0] < 0.5 ? ". The proteins renew half of it faster than the shortest delay" : ". Within the movie the proteins never renew half of it";
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
  function setQSpan() { const w = cache.res.window; qSpan = [w.q_min_used || w.q_lo_per_um, w.q_max_used || w.q_hi_per_um]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }
  // the delay at which a pattern is half renewed (f = 1/2), from its measured curve (log interpolation); null if never
  function halfTime(r) {
    if (!r || !r.f) return null; const t = cache.res ? cache.res.taus_s : null, f = r.f; if (!t) return null;
    for (let i = 1; i < f.length; i++) if (f[i - 1] >= 0.5 && f[i] < 0.5) { const w = (f[i - 1] - 0.5) / (f[i - 1] - f[i]); return t[i - 1] * Math.pow(t[i] / t[i - 1], w); }
    return null;
  }
  // five of the q used, spread over them
  function pickRows() {
    const rows = cache.res.rows, used = rows.filter(function (r) { return r.used; }), pool = used.length >= 2 ? used : rows.filter(function (r) { return r.f && r.A > 0; });
    const n = Math.min(5, pool.length), out = [];
    for (let i = 0; i < n; i++) out.push(pool[Math.round(i * (pool.length - 1) / Math.max(1, n - 1))]);
    return out;
  }
  // how much of each pattern is left, with the model fitted to it
  function drawCurves() {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    const a = axes($("chart-curves"), { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.25, y1: 1.25, xlabel: "Delay (s)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    const pick = pickRows();
    pick.forEach(function (r) {
      const col = qColor(qPos(r.q_per_um));
      if (r.model_f && level !== "curious") {
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); let on = false;
        r.model_f.forEach(function (v, li) { if (!isFinite(v)) return; const X = a.fx(taus[li]), Y = a.fy(v); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); });
        ctx.stroke();
      }
      r.f.forEach(function (f, li) { if (isFinite(f)) dot(ctx, a.fx(taus[li]), a.fy(Math.max(-0.25, Math.min(1.25, f))), 2.4, col, null); });
    });
    a.done();
    fillNumbers("curves-numbers", ["Delay (s)"].concat(pick.map(function (r) { return "q = " + fmtSig(r.q_per_um, 3); })), taus.map(function (t, li) { return [t].concat(pick.map(function (r) { return r.f[li]; })); }));
    const leg = $("curves-legend"); leg.innerHTML = "";
    pick.forEach(function (r) { const q = r.q_per_um, s = document.createElement("span"); s.innerHTML = '<i style="background:' + qColor(qPos(q)) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / q, 2) + " " + MU + "m" : "q = " + q.toFixed(2) + " " + MU + "m\u207b\u00b9"); leg.appendChild(s); });
  }
  // the diffusion coefficient found at each q, against one protein alone (D0) and the crowd as simulated (D_c)
  function drawDq() {
    const res = cache.res, rows = res.rows.filter(function (r) { return r.D_um2_s > 0; }), D0 = props().D0_um2_s, Dc = cache.movie.truth.Dc_um2_s;
    const x1 = Math.max.apply(null, rows.map(function (r) { return r.q_per_um; }).concat([1])) * 1.08;
    let top = Math.max(D0, Dc) * 1.5; rows.forEach(function (r) { if (r.used) top = Math.max(top, r.D_um2_s * Math.exp(Math.min(1, r.lnD_err))); });
    top = Math.min(top, 3 * Math.max(D0, Dc));
    const a = axes($("chart-dq"), { xlog: false, ylog: false, x0: 0, x1: x1, y0: 0, y1: top, xlabel: level === "curious" ? "Stripes: wide on the left, fine on the right (q, " + MU + "m\u207b\u00b9)" : "q (" + MU + "m\u207b\u00b9)", ylabel: level === "curious" ? "How fast they spread (" + MU + "m\u00b2/s)" : "D (" + MU + "m\u00b2/s)" }), ctx = a.ctx;
    const hline = function (v, col, dash, wd) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(v)); ctx.lineTo(a.m.l + a.pw, a.fy(v)); ctx.stroke(); ctx.setLineDash([]); };
    hline(D0, C.muted, [7, 4], 1.3);
    hline(Dc, C["accent-2"], [], 1.8);
    if (res.D_um2_s > 0) hline(res.D_um2_s, C.ink, [2, 4], 2);
    rows.forEach(function (r) {
      const X = a.fx(r.q_per_um), col = qColor(qPos(r.q_per_um)), v = Math.min(top, r.D_um2_s);
      if (r.used && level !== "curious" && r.lnD_err > 0) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(r.D_um2_s * Math.exp(-r.lnD_err))); ctx.lineTo(X, a.fy(Math.min(top, r.D_um2_s * Math.exp(r.lnD_err)))); ctx.stroke(); }
      dot(ctx, X, a.fy(v), 2.8, r.used ? col : null, r.used ? null : C.muted);
    });
    a.done();
    fillNumbers("chart-numbers", ["q (" + MU + "m\u207b\u00b9)", "D (" + MU + "m\u00b2/s)", "Uncertainty (%)", "Used"], res.rows.map(function (r) { return [r.q_per_um, r.D_um2_s > 0 ? r.D_um2_s : null, r.lnD_err > 0 ? 100 * r.lnD_err : null, r.used ? "yes" : (r.reason || "no")]; }));
    const ul = $("dq-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    if (level === "curious") {
      add("Dots: how fast the proteins spread, read from each pattern (hollow: patterns left out, mostly lost in the camera noise). Dotted line: their average. Red line: how fast the crowd spreads in the simulation. Dashed grey: one protein alone.");
      return;
    }
    const nu = res.rows.filter(function (r) { return r.used; }).length, why = {};
    res.rows.forEach(function (r) { if (!r.used && r.reason) why[r.reason] = (why[r.reason] || 0) + 1; });
    add("Dots: D from the fit at each q (bars: jackknife over parts of the movies; hollow: not used). Dotted: D = " + fmtSig(res.D_um2_s, 3) + " " + MU + "m\u00b2/s, the weighted mean of ln D over the " + nu + " q used. Red: D_c = " + fmtSig(Dc, 3) + ", as simulated. Dashed: D0 = " + fmtSig(D0, 3) + ", one protein alone.");
    const wk = Object.keys(why); if (wk.length) add("Left out: " + wk.map(function (k) { return why[k] + " q, " + k; }).join("; ") + ".");
  }
  // ---- step 7: the concentration series ------------------------------------------------------------------------
  // before and after a prediction the earlier series stays, as a dotted line
  let compare = null;
  function seriesLabel() { const t = PROTEINS[state.protein].label.replace(/ \(.*$/, ""); return t.charAt(0).toLowerCase() + t.slice(1) + ", " + fmtSig(state.salt_mM, 3) + " mM salt"; }
  // the earlier lines, measured if a series of that sample was run, else the simulated ones
  function takeSnapshot() {
    const r = props(), s = seriesValid() ? cache.series : null;
    compare = { label: seriesLabel(), measured: !!(s && s.fit.lineD), cmax: state.c_max,
      D: s && s.fit.lineD ? s.fit.lineD : { a: r.D0_um2_s, b: r.D0_um2_s * r.kD_mL_g * 1e-3 },
      A: s && s.fit.lineA ? s.fit.lineA.b / s.fit.lineA.a : 2 * r.A2_mol_mL_g2 * r.M_g_mol * 1e-3 };
  }
  // true c / A at each concentration, relative to its value at c = 0 (it is a straight line, 1 + 2 A2 M c)
  function trueRel(c, r) { return 1 + 2 * r.A2_mol_mL_g2 * r.M_g_mol * c * 1e-3; }
  function drawSeries() {
    const ok = seriesValid(), s = ok ? cache.series : null, r = s ? s.props : props();
    $("series-figs").hidden = !(ok || compare);
    $("btn-series").textContent = ok ? "Run the series again" : cache.series ? "Run the series for these settings" : "Run the concentration series";
    if (!ok && !compare) { $("series-state").textContent = cache.series ? "The settings changed since the last series: run it again to see these." : "Not run yet: about " + fmtDur(seriesSeconds()) + " for these settings."; return; }
    $("series-state").textContent = ok ? "" : "Running the series for these settings: the dotted lines are the earlier one.";
    const cmax = Math.max(state.c_max, compare ? compare.cmax : 0) * 1.08;
    const pts = s ? s.points : [], fit = s ? s.fit : {};
    // diffusion against concentration
    let lo = Infinity, hi = -Infinity;
    const lineD = function (L, c) { return L.a + L.b * c; };
    const consider = function (v) { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
    pts.forEach(function (p) { if (p.D > 0) { consider(p.D * (1 - p.D_rel_err)); consider(p.D * (1 + p.D_rel_err)); } });
    [0, cmax].forEach(function (c) { consider(r.D0_um2_s * (1 + r.kD_mL_g * c * 1e-3)); if (fit.lineD) consider(lineD(fit.lineD, c)); if (compare) consider(lineD(compare.D, Math.min(c, compare.cmax))); });
    const padD = 0.15 * (hi - lo || hi);
    const a = axes($("chart-sd"), { xlog: false, ylog: false, x0: 0, x1: cmax, y0: Math.max(0, lo - padD), y1: hi + padD, xlabel: "Concentration (mg/mL)", ylabel: level === "curious" ? "How fast they spread (" + MU + "m\u00b2/s)" : "D_c (" + MU + "m\u00b2/s)" }), ctx = a.ctx;
    const seg = function (f, col, dash, wd, alpha, end) { const ce = end || cmax; ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.globalAlpha = alpha || 1; ctx.beginPath(); ctx.moveTo(a.fx(0), a.fy(f(0))); ctx.lineTo(a.fx(ce), a.fy(f(ce))); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; };
    if (compare) seg(function (c) { return lineD(compare.D, c); }, C.ink, [2, 4], 2, 0.65, compare.cmax);
    seg(function (c) { return r.D0_um2_s * (1 + r.kD_mL_g * c * 1e-3); }, C["accent-2"], [], 1.8);
    if (fit.lineD) seg(function (c) { return lineD(fit.lineD, c); }, C.ink, [7, 4], 1.4);
    pts.forEach(function (p) { if (!(p.D > 0)) return; const X = a.fx(p.c); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(p.D * (1 - p.D_rel_err))); ctx.lineTo(X, a.fy(p.D * (1 + p.D_rel_err))); ctx.stroke(); dot(ctx, X, a.fy(p.D), 3, C.ink, null); });
    a.done();
    // the amplitude against the concentration, as in Guidolin et al. (2023), eq. 5: <A> = k c / (1 + c / c0), c0 = 1 / (2 A2 M).
    // Shown divided by k (from the fit), so that proteins that do not interact would lie on the line y = c. The fit is the
    // weighted straight line through c / A = (1 + c / c0) / k, the same model.
    const a0 = fit.lineA ? fit.lineA.a : null;
    // the simulated curve on the same scale: the true amplitudes give c / A_true = a_t (1 + 2 A2 M c)
    let at = 0, nt = 0; pts.forEach(function (p) { if (p.A_true > 0) { at += (p.c / p.A_true) / trueRel(p.c, r); nt++; } }); at = nt ? at / nt : null;
    const norm = a0 || at || 1;
    lo = 0; hi = -Infinity;
    const rel = pts.filter(function (p) { return p.A > 0; }).map(function (p) { return { c: p.c, y: p.A * norm, e: p.A * norm * p.A_rel_err }; });
    rel.forEach(function (p) { consider(p.y + p.e); });
    const tcurve = function (c) { return (at ? norm / at : 1) * c / trueRel(c, r); };
    const fcurve = function (c) { return c / (1 + fit.lineA.b / fit.lineA.a * c); };
    const ccurve = function (c) { return c / (1 + compare.A * c); };
    [cmax / 2, cmax].forEach(function (c) { consider(c); consider(tcurve(c)); if (fit.lineA) consider(fcurve(c)); if (compare) consider(ccurve(Math.min(c, compare.cmax))); });
    const b = axes($("chart-sa"), { xlog: false, ylog: false, x0: 0, x1: cmax, y0: 0, y1: hi * 1.1, xlabel: "Concentration (mg/mL)", ylabel: level === "curious" ? "Signal (relative)" : "<A> / k (mg/mL)" }), cb = b.ctx;
    const curveB = function (f, col, dash, wd, alpha, end) { const ce = end || cmax; cb.strokeStyle = col; cb.lineWidth = wd; cb.setLineDash(dash); cb.globalAlpha = alpha || 1; cb.beginPath(); for (let i = 0; i <= 60; i++) { const c = ce * i / 60, X = b.fx(c), Y = b.fy(f(c)); if (i === 0) cb.moveTo(X, Y); else cb.lineTo(X, Y); } cb.stroke(); cb.setLineDash([]); cb.globalAlpha = 1; };
    curveB(function (c) { return c; }, C.muted, [3, 3], 1.2);
    if (compare) curveB(ccurve, C.ink, [2, 4], 2, 0.65, compare.cmax);
    curveB(tcurve, C["accent-2"], [], 1.8);
    if (fit.lineA) curveB(fcurve, C.ink, [7, 4], 1.4);
    rel.forEach(function (p) { const X = b.fx(p.c); cb.strokeStyle = C.ink; cb.lineWidth = 1; cb.beginPath(); cb.moveTo(X, b.fy(p.y - p.e)); cb.lineTo(X, b.fy(p.y + p.e)); cb.stroke(); dot(cb, X, b.fy(p.y), 3, C.ink, null); });
    b.done();
    fillNumbers("series-numbers", ["c (mg/mL)", "D_c measured (" + MU + "m\u00b2/s)", "Uncertainty (%)", "D_c simulated", "&lt;A&gt; / k measured (mg/mL)", "Uncertainty (%)", "&lt;A&gt; / k simulated (mg/mL)"],
      pts.map(function (p) { return [p.c, p.D, 100 * p.D_rel_err, r.Dc(p.c), p.A > 0 ? p.A * norm : null, p.A > 0 ? 100 * p.A_rel_err : null, tcurve(p.c)]; }));
    const notes = function (id, list) { const ul = $(id); ul.innerHTML = ""; list.forEach(function (t) { if (!t) return; const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }); };
    const cmp = compare ? "Dotted line: the earlier " + (compare.measured ? "series" : "sample as simulated") + " (" + compare.label + ")." : null;
    if (level === "curious") {
      notes("sd-notes", [cmp, "Dots: how fast the proteins spread at each concentration (bars: uncertainty). Dashed: the straight line through them; where it meets the left edge is one protein on its own. Red: the simulation."]);
      notes("sa-notes", [cmp, "Dots: how strong the patterns are at each concentration. Grey: what proteins that do not interact would give, growing in step with the concentration. Below it, the proteins keep evenly spread; above it, they cluster a little. Dashed: the fit. Red: the simulation."]);
      return;
    }
    notes("sd-notes", [cmp, "Dots: D_c at each concentration, from step 6 (bars: jackknife). Dashed: weighted line D_c = D0 (1 + k_D c). Red: as simulated, k_D = " + fmtSig(r.kD_mL_g, 3) + " mL/g." + (fit.lineD ? " Fit: D0 = " + fmtSig(fit.D0, 3) + " +- " + fmtSig(fit.D0_err, 2) + " " + MU + "m\u00b2/s, k_D = " + fmtSig(fit.kD_mL_g, 3) + " +- " + fmtSig(fit.kD_err, 2) + " mL/g." : "")]);
    notes("sa-notes", [cmp, "Dots: <A>, the amplitude averaged over q = " + fmtSig(cache.res.amp_q[0], 2) + "-" + fmtSig(cache.res.amp_q[1], 2) + " " + MU + "m\u207b\u00b9" + (cache.opts && cache.opts.fix_D !== false ? " and fitted again at the D_c of the line" : "") + ", divided by k. Grey: <A> = k c, proteins that do not interact. Dashed: <A> = k c / (1 + c / c0) with c0 = 1 / (2 A2 M), as in Guidolin et al. (2023); A2 is their B2, in mol mL/g\u00b2. Red: as simulated, A2 = " + fmtA2(r.A2_mol_mL_g2) + "." + (fit.lineA ? " Fit: A2 = " + fmtA2(fit.A2) + " +- " + fmtA2(fit.A2_err) + " mol mL/g\u00b2" + (fit.lineA.b > 0 ? ", c0 = " + fmtSig(fit.lineA.a / fit.lineA.b, 2) + " mg/mL" : "") + "." : "")]);
  }
  function ampPoints() { const r = cache.res; return r.rows.map(function (x) { return { q: x.q_per_um, A: x.A, B: r.B_camera, used: x.used }; }); }
  // signal A(q) and camera noise B(q) at each q, as on the sizing page (Researcher level): where A sinks into B, the
  // patterns carry no usable signal and are left out
  // one line in the result box: how the signal compares with the camera noise over the patterns used
  function ampLine() {
    if (!cache.res) return "";
    const pts = ampPoints().filter(function (p) { return p.used && p.A > 0 && p.B > 0; });
    if (pts.length < 2) return "";
    const r = pts.map(function (p) { return p.A / p.B; }).sort(function (a, b) { return a - b; }), As = pts.map(function (p) { return p.A; }), Bs = pts.map(function (p) { return p.B; });
    const bLo = Math.min.apply(null, Bs), bHi = Math.max.apply(null, Bs);
    const fx = function (v) { return v >= 1e5 ? v.toExponential(1).replace("e+", "e") : fmtSig(v, 2); };
    return '<p class="small amp-line" style="margin:0.5rem 0 0"><b>Signal and camera noise:</b> over the ' + pts.length + ' patterns used, the signal A is ' + fmtSig(r[0], 2) + ' to ' + fmtSig(r[r.length - 1], 2) + ' times the camera noise B' +
      (level === "curious" ? '' : ' (A from ' + fx(Math.min.apply(null, As)) + ' to ' + fx(Math.max.apply(null, As)) + ', B ' + (bHi / bLo < 1.05 ? '= ' + fx(bLo) : 'from ' + fx(bLo) + ' to ' + fx(bHi)) + ')') + '; the chart of A and B is in this step.</p>';
  }
  function drawAmp() {
    if (!cache.res) return;
    const res = cache.res, pts = ampPoints().filter(function (p) { return p.q > 0 && (p.A > 0 || p.B > 0); });
    const vals = []; pts.forEach(function (p) { if (p.A > 0) vals.push(p.A); if (p.B > 0) vals.push(p.B); });
    if (vals.length < 2) return;
    vals.sort(function (p, q) { return p - q; });
    const y0 = vals[0] / 2.5, y1 = vals[vals.length - 1] * 2.5, qs = pts.map(function (p) { return p.q; });
    const x0 = Math.min.apply(null, qs) * 0.8, x1 = Math.max.apply(null, qs) * 1.25;
    const a = axes($("chart-amp"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "A(q), B(q)" }), ctx = a.ctx;
    const clampY = function (v) { return Math.min(y1 / 1.05, Math.max(y0 * 1.05, v)); };
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); let on = false;
    pts.forEach(function (p) { if (!(p.B > 0)) { on = false; return; } const X = a.fx(p.q), Y = a.fy(clampY(p.B)); if (!on) { ctx.moveTo(X, Y); on = true; } else ctx.lineTo(X, Y); });
    ctx.stroke(); ctx.setLineDash([]);
    pts.forEach(function (p) { if (p.A > 0) dot(ctx, a.fx(p.q), a.fy(clampY(p.A)), p.used ? 3 : 2.4, p.used ? C.accent : null, C.accent); });
    const qo = res.window && res.window.q_opt_per_um;
    if (qo > x0 && qo < x1) { ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; const xq = a.fx(qo); ctx.beginPath(); ctx.moveTo(xq, a.m.t); ctx.lineTo(xq, a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]); }
    a.done();
    $("amp-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>A: signal at each q (filled: used, hollow: left out)</span><span><i style="background:' + C.muted + '"></i>B: camera noise (dashed)</span><span>Vertical dashed line: the finest pattern the objective resolves</span>';
    fillNumbers("amp-numbers", ["q (" + MU + "m\u207b\u00b9)", "A", "B", "Used"], pts.map(function (p) { return [p.q, p.A > 0 ? p.A : null, p.B > 0 ? p.B : null, p.used ? "yes" : "no"]; }));
  }
  // ---- result -------------------------------------------------------------------------------
  function rApp(D) { return KB * (state.T_C + 273.15) / (6 * Math.PI * viscosity_mPa_s() * 1e-3 * D * 1e-12) * 1e9; }
  // the diffusion coefficient found against the one simulated: within twice its uncertainty and 5 %
  function verdict() {
    const res = cache.res, Dt = cache.movie.truth.Dc_um2_s;
    if (!(res.D_um2_s > 0)) return { cls: "bad", text: "No diffusion found" };
    const off = res.D_um2_s / Dt - 1, tol = Math.max(0.05, 2 * res.D_rel_err);
    return Math.abs(off) < tol ? { cls: "good", text: "D_c as simulated (within " + Math.round(100 * tol) + " %)" } : Math.abs(off) < 2 * tol ? { cls: "warn", text: "D_c off by " + Math.round(100 * Math.abs(off)) + " %" } : { cls: "bad", text: "D_c far from the simulation (" + (off > 0 ? "+" : "-") + Math.round(100 * Math.abs(off)) + " %)" };
  }
  function seriesVerdict(fit, r) {
    if (!fit || !fit.lineD) return null;
    const dk = Math.abs(fit.kD_mL_g - r.kD_mL_g), tol = Math.max(2 * fit.kD_err, 2);
    return dk < tol ? { cls: "good", text: "k_D as simulated, within its uncertainty" } : { cls: "warn", text: "k_D off by " + fmtSig(dk, 2) + " mL/g (uncertainty " + fmtSig(fit.kD_err, 2) + ")" };
  }
  function renderResult() {
    const res = cache.res, mv = cache.movie, r = props(), v = verdict(), c = cache.cfg ? cache.cfg.protein : null, conc = state.conc;
    const D = res.D_um2_s, Ra = D > 0 ? rApp(D) : NaN, ok = seriesValid(), s = ok ? cache.series : null, f = s ? s.fit : null;
    let h = '<div class="eyebrow">Result</div>';
    h += '<div class="big">' + (D > 0 ? (level === "curious" ? "Looks " + fmtSig(Ra, 3) + " nm in radius" : "Apparent radius " + fmtSig(Ra, 3) + " nm") : "No diffusion found") + '</div>';
    h += '<p class="small" style="margin:0">' + (D > 0 ? "At " + fmtSig(conc, 3) + " mg/mL the proteins spread with D = " + fmtSig(D, 3) + " +- " + fmtSig(D * res.D_rel_err, 2) + " " + MU + "m\u00b2/s. The radius set in the simulation is " + fmtSig(r.Rh_nm, 3) + " nm: " +
      (Math.abs(r.kD_mL_g * conc * 1e-3) < 0.02 ? "at this concentration the interactions hardly change it." : r.kD_mL_g > 0 ? "the repulsion between the proteins outweighs the drag of their neighbours, so the crowd spreads faster than one alone and looks smaller." : "the drag of neighbours, and any attraction, outweigh the repulsion, so the crowd spreads more slowly than one alone and looks larger.") : "No pattern carried enough signal above the camera noise.") + '</p>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    if (f && f.lineD) {
      const sv = seriesVerdict(f, s.props);
      h += '<p class="small" style="margin:0.5rem 0 0"><b>From the series (step 7):</b> ' + (level === "curious" ? "one protein on its own is " + fmtSig(f.Rh_nm, 2) + " nm in radius (set in the simulation: " + fmtSig(s.props.Rh_nm, 2) + "), and the denser the crowd, the " + (f.kD_mL_g > 0 ? "faster it spreads: repulsion outweighs the drag of neighbours" : "more slowly it spreads: the drag of neighbours, and any attraction, outweigh the repulsion") + " (k_D = " + fmtSig(f.kD_mL_g, 2) + " mL/g, simulated " + fmtSig(s.props.kD_mL_g, 2) + ")." :
        "R_h at infinite dilution = " + fmtSig(f.Rh_nm, 3) + " nm (simulated " + fmtSig(s.props.Rh_nm, 3) + "), k_D = " + fmtSig(f.kD_mL_g, 3) + " +- " + fmtSig(f.kD_err, 2) + " mL/g (" + fmtSig(s.props.kD_mL_g, 3) + ")" + (f.A2 !== undefined ? ", A2 = " + fmtA2(f.A2) + " +- " + fmtA2(f.A2_err) + " mol mL/g\u00b2 (" + fmtA2(s.props.A2_mol_mL_g2) + ")" : "") + ".") + '</p>';
      if (sv) h += '<span class="chip ' + sv.cls + '">' + sv.text + '</span>';
    }
    if (level !== "curious") {
      const f3 = function (x) { return x === null || x === undefined || !isFinite(x) ? "-" : fmtSig(x, 3); };
      const pm = function (x, e) { return x === null || x === undefined || !isFinite(x) ? "-" : fmtSig(x, 3) + (e > 0 ? " +- " + fmtSig(e, 2) : ""); };
      const row = function (cls, name, d, ra, kd, a2, rh, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + d + '</td><td>' + ra + '</td><td>' + kd + '</td><td>' + a2 + '</td><td>' + rh + '</td></tr>'; };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">D at ' + fmtSig(conc, 3) + ' mg/mL (' + MU + 'm\u00b2/s)</th><th scope="col">Apparent radius (nm)</th><th scope="col">k_D (mL/g)</th><th scope="col">A2, static (1e-4 mol mL/g\u00b2)</th><th scope="col">R_h from D0 (nm)</th></tr></thead><tbody>';
      t += row("main", "This page", pm(D, D * res.D_rel_err), f3(Ra), f ? pm(f.kD_mL_g, f.kD_err) : "-", f && f.A2 !== undefined ? pm(f.A2 * 1e4, f.A2_err * 1e4) : "-", f && f.Rh_nm ? f3(f.Rh_nm) : "-", "the headline; series values once step 7 has run");
      if (level === "addict" && res.published) {
        const pb = res.published, fp = s ? s.published : null;
        t += pb.failed ? row("pub", "Published method only", "-", "-", "-", "-", "-", "could not run: " + pb.failed) : row("pub", "Published method only", pm(pb.D_um2_s, pb.D_um2_s * pb.D_rel_err), f3(rApp(pb.D_um2_s)), fp && fp.lineD ? pm(fp.kD_mL_g, fp.kD_err) : "-", fp && fp.A2 !== undefined ? pm(fp.A2 * 1e4, fp.A2_err * 1e4) : "-", fp && fp.Rh_nm ? f3(fp.Rh_nm) : "-", "the same movies: one exponential per q, frames taken as instants, amplitudes from their own fits");
      }
      t += row("truth", "Simulation", f3(mv.truth.Dc_um2_s), f3(rApp(mv.truth.Dc_um2_s)), f3(r.kD_mL_g), f3(r.A2_mol_mL_g2 * 1e4), f3(r.Rh_nm), "");
      t += '</tbody></table></div>';
      h += t;
      const used = res.rows.filter(function (x) { return x.used; });
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Patterns used</dt><dd>' + (used.length ? 'q from ' + fmtSig(res.window.q_min_used, 2) + ' to ' + fmtSig(res.window.q_max_used, 2) + ' ' + MU + 'm\u207b\u00b9 (' + used.length + ' of ' + res.rows.length + ' q)' : 'none') + ', where the fit found a decay above the camera noise, within the movie and slower than one frame</dd>';
      h += '<dt>Movies</dt><dd>' + res.repeats + ' of ' + mv.T + ' frames, analysed together (their structure functions averaged)</dd>';
      h += '<dt>Model</dt><dd>d = A g(q, \u0394t) + B, with B = ' + fmtSig(res.B_camera, 3) + ' from the camera' + (res.depth ? ', g from the motion along the axis too (' + res.nmodes + ' modes in depth)' : ', g = 1 - exp(-D q\u00b2 \u0394t)') + (res.exposure ? ', averaged over the exposure of ' + fmtTime(mv.exposure_s) : '') + '</dd>';
      h += '<dt>Amplitude</dt><dd>mean of A over q = ' + fmtSig(res.amp_q[0], 2) + '-' + fmtSig(res.amp_q[1], 2) + ' ' + MU + 'm\u207b\u00b9 (' + res.n_amp + ' q): ' + (res.A_mean ? fmtSig(res.A_mean, 3) + ' +- ' + fmtSig(100 * res.A_rel_err, 2) + ' %' : '-') + '</dd>';
      h += '<dt>Simulation</dt><dd>a density field: ' + fmtCount(mv.truth.n_proteins) + ' proteins in a chamber ' + fmtSig(cache.cfg.cell_um, 3) + ' ' + MU + 'm deep, S(0) = ' + fmtSig(mv.truth.S0, 3) + ', D_c = ' + fmtSig(mv.truth.Dc_um2_s, 3) + ' ' + MU + 'm\u00b2/s</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h + ampLine();
    $("hero-result").innerHTML = '<span>' + (level === "curious" ? "Radius in the simulation" : "R_h, simulated") + '</span><span class="n">' + fmtSig(r.Rh_nm, 3) + ' nm</span><span>Measured by DDM at ' + fmtSig(conc, 3) + ' mg/mL</span><span class="n">' + (D > 0 ? fmtSig(Ra, 3) + ' nm' : "-") + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated bright-field movie of " + PROTEINS[state.protein].label.replace(/ \(.*$/, "").toLowerCase() + " at " + fmtSig(conc, 3) + " mg/mL, " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg, r = props();
    $("movie-text").textContent = "The movie shows " + PROTEINS[state.protein].label.replace(/ \(.*$/, "").toLowerCase() + " at " + fmtSig(state.conc, 3) + " mg/mL in a buffer with " + fmtSig(state.salt_mM, 3) + " mM salt, filmed in bright field. No protein can be seen: what flickers is mostly the camera's shot noise. Under it, the number of proteins in each small volume rises and falls a little as they diffuse, and the light follows.";
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s, exposure " + fmtTime(m.exposure_s) + " (all rows together: global shutter assumed). " + (cache.res.repeats > 1 ? cache.res.repeats + " such movies of the same sample. " : "") + "Chamber " + cfg.cell_um + " " + MU + "m deep, focus " + fmtSig(cfg.focus_um, 3) + " " + MU + "m above its bottom, " + fmtCount(m.truth.n_proteins) + " proteins below the simulated field.";
    $("diff-note").textContent = "Here the difference looks like pure noise: the proteins add a ripple far weaker than the camera's shot noise. Step 4 tells the two apart.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const res = cache.res, s = seriesValid() ? cache.series : null, r = props();
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: "brightfield", detector: cam().label, simulation: cache.cfg, repeats: res.repeats, analysis: cache.opts,
      protein: { M_g_mol: r.M_g_mol, Rh_nm: r.Rh_nm, Z: r.Z, I_mM: r.I_mM, eps_kT: r.eps_kT, delta_nm: r.delta_nm, A2_mol_mL_g2: +r.A2_mol_mL_g2.toPrecision(3), kD_mL_g: +r.kD_mL_g.toPrecision(3), D0_um2_s: +r.D0_um2_s.toPrecision(3) },
      result: { D_um2_s: res.D_um2_s ? +res.D_um2_s.toPrecision(4) : null, D_rel_err: res.D_rel_err ? +res.D_rel_err.toPrecision(2) : null,
        q_per_um: res.rows.map(function (x) { return +x.q_per_um.toPrecision(3); }), D_per_q: res.rows.map(function (x) { return x.D_um2_s ? +x.D_um2_s.toPrecision(3) : null; }), used: res.rows.map(function (x) { return x.used ? 1 : 0; }) },
      series: s ? { c_mg_mL: s.points.map(function (p) { return p.c; }), D_um2_s: s.points.map(function (p) { return p.D ? +p.D.toPrecision(4) : null; }), A: s.points.map(function (p) { return p.A ? +p.A.toPrecision(4) : null; }),
        kD_mL_g: s.fit.kD_mL_g !== undefined ? +s.fit.kD_mL_g.toPrecision(3) : null, A2_mol_mL_g2: s.fit.A2 !== undefined ? +s.fit.A2.toPrecision(3) : null, Rh_nm: s.fit.Rh_nm ? +s.fit.Rh_nm.toPrecision(3) : null } : null };
    $("settings-json").textContent = JSON.stringify(obj, null, 1).replace(/\[\s+([-\d.e+,\s\[\]nul]+?)\s+\]/g, function (m, a) { return "[" + a.replace(/\s+/g, " ") + "]"; });
    focusableScrollers();
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)"); $("lag").setAttribute("aria-valuetext", fmtDur(res.taus_s[li])); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawDq(); drawSeries(); drawAmp(); renderResult(); renderSettings();
  }
  // ---- "what matters" cards ---------------------------------------------------------------
  // a button may also start the series of step 7 once the bench has run
  const CARDS = [
    { lvl: 1, title: "Apparent radius and radius alone", text: "At one concentration DDM gives how fast the proteins spread, and the Stokes-Einstein relation turns that into a radius. For the antibody in low salt the crowd spreads faster than one antibody alone, because the antibodies repel each other: at 8 mg/mL the radius comes out about 4.8 nm instead of 5.3 (in our tests 5.0 +- 0.15). At 2 mg/mL it would come out closer, 5.2 nm, but the signal is four times weaker: in our tests only a few patterns rose above the camera noise, and the uncertainty grew to about 20 %. The series of step 7, extrapolated to zero concentration, gives the radius of one antibody on its own (the infinite-dilution hydrodynamic radius) with both problems kept in check.",
      shows: [{ label: "2 mg/mL", set: { conc: 2 }, go: "step-rates" }, { label: "8 mg/mL", set: {}, go: "step-rates" }, { label: "The series", set: {}, go: "step-series", series: true }] },
    { lvl: 1, title: "Salt switches the interactions", text: "At 15 mM salt the antibodies, all positively charged, repel each other over a few nanometres (the Debye length is 2.5 nm): k_D is about +14 mL/g, and A2 is larger than for hard spheres of their size. At 115 mM the salt screens the charge within 0.9 nm, and in the diffusion slope the drag of neighbours and the short-range attraction outweigh what is left of the repulsion: k_D falls to about -5 mL/g. A2 stays positive, though below the value for hard spheres: on balance the antibodies still keep apart, mostly by their size. A negative k_D alone does not mean that proteins attract. In our tests the series gave k_D = 10 +- 4 mL/g at 15 mM (up to 15 mg/mL) and -4.6 +- 0.6 at 115 mM (up to 30 mg/mL): the higher concentrations give a stronger signal and a longer lever.",
      shows: [{ label: "15 mM salt", set: {}, go: "step-series", series: true }, { label: "115 mM salt", set: { salt_mM: 115, c_max: 30 }, go: "step-series", series: true }] },
    { lvl: 1, title: "Albumin, as in our 2023 paper", text: "Bovine serum albumin in phosphate-buffered saline, as in our 2023 paper: its negative charge is mostly screened, so it behaves nearly as a hard sphere with a little extra repulsion. The model gives k_D = 4.5 mL/g, against 4 +- 1 measured by DDM in the paper. In the paper the amplitudes also gave a static second virial coefficient, B2 = (3 +- 1)e-4 mol mL/g\u00b2 (the A2 of this page), larger than most published values; the model here uses 1.1e-4, the value that goes with the k_D. Albumin is less than half as heavy as an antibody, so its signal per mg/mL is weaker: in our tests the series gave k_D = 2 +- 2 mL/g, A2 = (1.2 +- 0.1)e-4 and R_h = 3.3 nm (set in the simulation: 3.4).",
      shows: [{ label: "Albumin in saline", set: { protein: "bsa" }, go: "step-series", series: true }] },
    { lvl: 1, title: "A sticky antibody", text: "An antibody with a stronger short-range attraction, at 115 mM salt: A2 is below zero, so the proteins cluster a little, and k_D is about -21 mL/g. At 18 mg/mL the crowd spreads 37 % more slowly than one antibody alone, and read at that concentration alone it would look 8.5 nm in radius instead of 5.3. A strong effect is easy to measure: in our tests the series gave k_D = -20.6 +- 0.9 mL/g and A2 = -1.1e-5 +- 0.3e-5 mol mL/g\u00b2 (simulated -1.4e-5).",
      shows: [{ label: "Sticky antibody", set: { protein: "sticky" }, go: "step-series", series: true }] },
    { lvl: 2, title: "Lysozyme: a faint signal", text: "The signal of a protein solution grows with the mass of each protein: at the same mg/mL, lysozyme (14 kDa) gives about ten times less than an antibody. At 30 mg/mL DDM finds its diffusion within about 7 % in our tests, at 20 mg/mL within about 20 % and from a handful of patterns only, and below about 12 mg/mL not at all. The series up to 40 mg/mL still gave k_D = -11 +- 3 mL/g (simulated -8.5), but A2 was lost in the noise. Here DDM needs longer movies than the browser can hold, or a brighter setup.",
      shows: [{ label: "Lysozyme, 30 mg/mL", set: { protein: "lyso" }, go: "step-rates" }, { label: "20 mg/mL", set: { protein: "lyso", conc: 20 }, go: "step-rates" }] },
    { lvl: 2, title: "Close the condenser", text: "With the condenser closed down (NA 0.1) the light is nearly coherent, and each protein still changes the image several micrometres away from focus: proteins through a thick layer add to the patterns. Opening it to NA 0.3 makes the layer thin and the patterns faint. In our tests at 8 mg/mL, NA 0.1 gave D within about 3 %, while at NA 0.3 no pattern rose above the camera noise.",
      shows: [{ label: "NA 0.1", set: {}, go: "step-rates" }, { label: "NA 0.3", set: { na_c: 0.3 }, go: "step-rates" }] },
    { lvl: 2, title: "Why the numbers scatter", text: "Each protein changes the light reaching a pixel by about a ten-millionth, so the camera's shot noise dwarfs their ripples: precision comes from collecting many photons over many frames. Binning 2 x 2 puts four times more light into each pixel and covers a field four times larger; four movies instead of one add more. In our tests at 8 mg/mL the uncertainty of D went from about 6 % (no binning, one movie) to about 3 % (binned, four movies). Real experiments record far longer movies over larger fields than a browser can hold.",
      shows: [{ label: "No binning, one movie", set: { binning: 1, repeats: 1 }, go: "step-rates" }, { label: "Binned 2 x 2, four movies", set: {}, go: "step-rates" }] }
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
          btn.addEventListener("click", function () { applyPreset(s.set); if (s.series) startSeries(); document.getElementById(s.go).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
          b.appendChild(btn);
        });
        el.appendChild(b);
      }
      host.appendChild(el);
    });
  }
  // a preset: the standard sample with some settings changed; a protein brings its own charge, salt and concentrations
  // unless the preset sets them
  function applyPreset(set) {
    const keep = state.seed, sp = state.sim_px;
    compare = null; state = Object.assign({}, BASE);
    if (set.protein) { state.protein = set.protein; applyProtein(BASE.protein); }
    Object.assign(state, set);
    state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    prevProtein = state.protein;
    if (set.camera && !set.cam_mode) { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; }
    resetPredictions();
    constrain(); syncControls(); drawFov(); if (cache.res) drawSeries(); schedule();
  }
  let predicting = false;
  const STD = function () { return state.protein === "mab" && state.salt_mM <= 30; };
  const PREDICT_BASE = {
    radius: function () { return !STD() || state.conc < 4 ? { text: "This question starts from the antibody at 8 mg/mL in low salt (15 mM); the bench now has something else.", set: {} } : null; },
    salt: function () { return !STD() ? { text: "This question starts from the antibody in low salt (15 mM); the bench now has something else.", set: {} } : null; }
  };
  const PREDICT_VALUES = {
    rapp: function () { return cache.res && cache.res.D_um2_s > 0 ? fmtSig(rApp(cache.res.D_um2_s), 3) : "-"; },
    rh: function () { return fmtSig(props().Rh_nm, 2); },
    conc: function () { return fmtSig(state.conc, 3); },
    kd: function () { return fmtSig(props().kD_mL_g, 2); },
    kdhigh: function () { const s = state.salt_mM; state.salt_mM = 115; const v = props().kD_mL_g; state.salt_mM = s; return fmtSig(v, 2); }
  };
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
    if (predicting) return;
    document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelector(".a").hidden = true; bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); });
  }
  function buildPredictions() {
    document.querySelectorAll(".predict").forEach(function (box) {
      box.querySelectorAll("button[data-guess]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (box.classList.contains("answered")) return;
          syncPredictionBases();   // the numbers of the answer from the run on the bench
          box.classList.add("answered");
          box.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = true; b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
          box.querySelector(".verdict").textContent = btn.getAttribute("data-guess") === box.getAttribute("data-right") ? "Well guessed." : "Not quite.";
          box.querySelector(".a").hidden = false; announce(box.querySelector(".a").textContent);
          const kind = box.getAttribute("data-predict");
          if (kind === "salt") {
            takeSnapshot(); state.salt_mM = 115; state.c_max = 30;
            predicting = true; constrain(); syncControls(); predicting = false;
            if (cache.res) drawSeries();
            schedule(); seriesQueued = true;
          }
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
  $("btn-reset").addEventListener("click", function () { compare = null; const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; prevProtein = state.protein; document.querySelectorAll(".predict .a").forEach(function (a) { a.hidden = true; }); document.querySelectorAll(".predict").forEach(function (bx) { bx.classList.remove("answered"); bx.querySelectorAll("button[data-guess]").forEach(function (b) { b.disabled = false; b.removeAttribute("aria-pressed"); }); }); constrain(); syncControls(); drawFov(); schedule(); });
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
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawDq(); drawSeries(); drawAmp(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  $("btn-series").addEventListener("click", function () { startSeries(); });

  const PAGE_NAME = "proteins";
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
  // keys a shared link may set: the controls of the page, the q range and the seed (not the settings this page keeps
  // fixed, such as the imaging mode)
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
  function movieName() { const mv = cache.movie; return "ddm-" + PAGE_NAME + "-" + state.protein + "-" + fmtSig(state.conc, 3) + "mgml-" + mv.n + "x" + mv.n + "x" + mv.T; }
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
    preset: applyPreset, state: function () { return JSON.parse(JSON.stringify(state)); }, series: startSeries,
    controls: function () { return CONTROLS.filter(function (c) { return c.kind !== "qrange" && (!c.when || c.when()); }).map(function (c) {
      const opts = c.kind === "objective" ? OBJECTIVES.map(function (o, i) { return i; }) : c.kind === "select" ? (typeof c.options === "function" ? c.options() : c.options).map(function (o) { return o[0]; }) : null;
      return { key: c.key, kind: c.kind, lvl: c.lvl, min: c.min, max: c.max, options: opts };
    }); },
    truth: function () { return cache && cache.movie ? cache.movie.truth : null; },
    cfg: function () { return cache && cache.cfg ? JSON.parse(JSON.stringify(cache.cfg)) : null; },
    result: function () { const r = cache && cache.res; if (!r) return null; const p = props(), s = seriesValid() ? cache.series : null;
      return { D: r.D_um2_s, D_rel_err: r.D_rel_err, D_true: cache.movie.truth.Dc_um2_s, R_app_nm: r.D_um2_s > 0 ? rApp(r.D_um2_s) : null, verdict: verdict().text, n_used: r.rows.filter(function (x) { return x.used; }).length,
        published: r.published || null, truth: { kD: p.kD_mL_g, A2: p.A2_mol_mL_g2, Rh: p.Rh_nm, D0: p.D0_um2_s }, series: s ? { points: s.points, fit: s.fit, published: s.published } : null }; }
  };
})();
