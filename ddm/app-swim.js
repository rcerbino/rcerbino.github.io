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
  const SHAPES = { rod: "Rods (most bacteria)", sphere: "Spheres (cocci, or active colloids)" };
  // materials that make sense for each shape; the first is the default when the shape is chosen
  const SHAPE_MATERIALS = { sphere: ["bacterium", "ps", "silica", "custom"], rod: ["bacterium", "silica", "ps", "custom"] };
  const SIZE_LABEL = { sphere: "Diameter", rod: "Length" };
  const ASPECT_LABEL = { rod: "Aspect ratio (length / diameter)" };
  const LIQUIDS = { water: "Water or motility buffer", glycerol: "Water + glycerol", custom: "Other (set index and viscosity)" };
  const FIELD_NUMBER_MM = 25;          // Ti2 field of view (F-mount port); also the X-Light V3 and AX scan fields

  function objIndexByName(name) { for (let i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].n === name) return i; throw new Error("objective not found: " + name); }

  // the standard sample: a motility assay of E. coli-like rods (2 um x 0.8 um) in motility buffer, 60 % swimming at
  // 20 um/s (Schulz spread 30 %), phase contrast with a 10x Ph1 objective, 256 frames at 50 frames/s (after Wilson et al. 2011; 5 s of movie
  // let the cells that do not swim diffuse far enough to tell them apart from the swimmers)
  const BASE = {
    mode: "phase", particle: "bacterium", n_custom: 1.39, diameter_um: 2, size_spread: 0, size_dist: "schulz", phi: 1e-3,
    liquid: "water", glycerol_w: 0.5, n_liquid: 1.333, visc_mPa_s: 1.0, T_C: 22, cell_um: 50, focus_frac: 0.5, drift_um_s: 0, settle: "off", rho_custom: 1.05, rho_liquid: 1.0, optics: "auto",
    objective: objIndexByName("CFI Plan Fluor DLL 10X"), condenser: "lwd", na_c: 0.3, source: "halogen",
    dye: "green", rate_ph_ms: 200, bg_e_ms: 2, light_frac: 0.5,
    camera: "orca", cam_mode: "standard", iface: "cameralink", binning: 1, roi: 512, sim_px: 128, n_frames: 256,
    annulus: "Ph1", ring_T: 0.25, df_kind: "annulus", df_light_e: 1e7, stray_frac: 1e-4, dic_shear_um: 0.24, dic_bias_deg: 90, dic_angle_deg: 45,
    scanner: "resonant", scan_px: 512, zoom: 1, line_avg: 1, pinhole_au: 1, scan_rate: 2e8,
    frame_rate_hz: 50, exposure_ms: 1, frame_timing: "even", log_factor: 20,
    shape: "rod", aspect: 2.5, dn: 0, dn_body: 0, polarizer: "off", analyzer: "off", pol_angle_deg: 90, extinction: 1e-4,
    swim_frac: 0.6, swim_v: 20, swim_spread: 0.3, swim_geom: "3d", swim_rot: 0.1, swim_tumble: 0,
    swim_model: "auto", windowing: "off", q_min: null, q_max: null, seed: 1,
    x_noise: "on", x_shape: "on", x_dcells: "on", x_turn: "on", x_tumble: "on", x_axial: "on", x_amp: "on", x_window: "on",
    organism: "model", swim_osc_amp: 0, swim_osc_hz: 20, swim_osc_dir: "along", drag: 1
  };
  // Microorganisms measured with DDM, with the values reported in the papers (marked "assumed" where a paper gives none).
  // Each entry changes the sample, and the microscope and recording to those of the paper where they fit the page.
  const PH10 = { mode: "phase", objective: objIndexByName("CFI Plan Fluor DLL 10X") };
  const BFOBJ = function (name, nac) { return { mode: "brightfield", objective: objIndexByName(name), condenser: "lwd", na_c: nac }; };
  const ORGANISMS = {
    model: { label: "Example: E. coli-like rods on straight runs (the start of this page)", set: {},
      text: "Not a real strain: E. coli-sized rods (2 x 0.8 " + MU + "m) that swim in straight lines without tumbling, a clean case for the model." },
    ecoli_wt: { label: "E. coli, wild type (AB1157): run and tumble", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.58, swim_v: 13.7, swim_spread: 0.51, swim_tumble: 0.42, q_min: 0.3 }),
      text: "Mean speed 13.7 " + MU + "m/s, spread 7.0 " + MU + "m/s, 58 % swimming, 10x phase contrast at 100 frames/s (Wilson et al. 2011). Runs of about 2.4 s between tumbles (Kurzthaler et al. 2024). Cells 2.4 x 0.86 " + MU + "m (Schwarz-Linek et al. 2016). The fit starts at q = 0.3 " + MU + "m\u207b\u00b9: over longer distances the tumbles bend the runs, which the model leaves out (Wilson et al. used q from 0.5)." },
    ecoli_smooth: { label: "E. coli, smooth swimmer (cheY deletion): no tumbles", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.585, swim_v: 10.9, swim_spread: 0.59, swim_tumble: 0 }),
      text: "AB1157 without cheY: the motors never reverse, so the cells never tumble. Mean speed 10.9 " + MU + "m/s, spread 6.4 " + MU + "m/s, 58.5 % swimming, D = 0.35 " + MU + "m\u00b2/s (Martinez et al. 2012)." },
    ecoli_glucose: { label: "E. coli, wild type with glucose: faster", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.7, swim_v: 22, swim_spread: 0.5, swim_tumble: 0.42, q_min: 0.3 }),
      text: "Glucose in the motility buffer raises the speed by about half, up to about 25 " + MU + "m/s (Jepson et al. 2013; Schwarz-Linek et al. 2016). Speed 22 and share 70 % assumed within the reported ranges." },
    ecoli_pvp: { label: "E. coli, wild type in a polymer solution (PVP 360k, 1 %)", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.58, swim_v: 15, swim_spread: 0.5, swim_tumble: 0.42, q_min: 0.3, liquid: "custom", n_liquid: 1.335, visc_mPa_s: 4 }),
      text: "In 1 % PVP 360k (about 4 mPa s) the cells swim about as fast as in buffer (15 " + MU + "m/s), while the cells that do not swim diffuse four times more slowly (Martinez et al. 2014)." },
    ecoli_light: { label: "E. coli powered by light (proteorhodopsin, AD10), light on", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.8, swim_v: 9.5, swim_spread: 0.5, swim_tumble: 0 }),
      text: "Smooth swimmers that run on light once the oxygen is used up: 9.5 " + MU + "m/s at about 5 mW/cm\u00b2 of green light, up to about 27 " + MU + "m/s in brighter light (Arlt et al. 2018). Share and spread assumed." },
    ecoli_dark: { label: "E. coli powered by light (AD10), light off", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.01, swim_v: 9.5, swim_spread: 0.5, swim_tumble: 0 }),
      text: "Within a second of switching the light off fewer than 1 % of the cells still swim (Arlt et al. 2018)." },
    ecoli_nz1: { label: "E. coli with tunable tumbling (NZ1), much IPTG", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0.95, swim_v: 23.5, swim_spread: 0.25, swim_tumble: 0.1 }),
      text: "IPTG switches on cheZ: without it the cells tumble all the time, with more of it the runs get longer, by about two orders of magnitude in persistence length; speed about 23.5 " + MU + "m/s (Kurzthaler et al. 2024). Runs of 10 s assumed here." },
    ecoli_mota: { label: "E. coli, paralysed flagella (motA): no swimming", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0, drag: 1.02 }),
      text: "The motors have no stators, so the flagella do not turn. The cells only diffuse: D = 0.30 " + MU + "m\u00b2/s (Wilson et al. 2011) or 0.29 (Jepson et al. 2013), slowed by the flagella they carry." },
    ecoli_flif: { label: "E. coli without flagella (fliF): no swimming", set: Object.assign({}, PH10, { diameter_um: 2.4, aspect: 2.8, swim_frac: 0, drag: 0.76 }),
      text: "No flagella at all: D = 0.39 " + MU + "m\u00b2/s, faster than cells with paralysed flagella (Jepson et al. 2013)." },
    ecoli_dh5a: { label: "E. coli DH5alpha, no flagella, in dark field", set: { mode: "darkfield", df_kind: "annulus", annulus: "Ph3", objective: objIndexByName("CFI Plan Fluor 10X"), diameter_um: 1.8, aspect: 2, swim_frac: 0, liquid: "custom", n_liquid: 1.34, visc_mPa_s: 2.1 },
      text: "Non-motile cells in PBS with Percoll (to stop them sinking). Dark field sees them turn: D_t = 0.149 " + MU + "m\u00b2/s and D_R = 0.165 s\u207b\u00b9 (Cerbino et al. 2017; Lattuada et al. 2025). Size and viscosity chosen here to give both." },
    salmonella: { label: "Salmonella Typhimurium (SJW1103)", set: Object.assign({}, BFOBJ("CFI Plan Fluor 10X", 0.1), { diameter_um: 2.5, aspect: 3.1, swim_frac: 0.8, swim_v: 21.2, swim_spread: 0.53, swim_tumble: 0, frame_rate_hz: 100 }),
      text: "Mean speed 21.2 " + MU + "m/s, spread 11.3 " + MU + "m/s, 80 % swimming, D = 0.28 " + MU + "m\u00b2/s; 10x bright field (Germain et al. 2016, a student lab). Size assumed; tumbles left out." },
    bsubtilis: { label: "Bacillus subtilis", set: Object.assign({}, PH10, { diameter_um: 4, aspect: 5, swim_frac: 0.9, swim_v: 55, swim_spread: 0.5 }),
      text: "Measured by confocal DDM in a dense suspension: rate = v\u2080 q with v\u2080 = 24.9 " + MU + "m/s and a compressed exponential of exponent 1.35 (Lu et al. 2012; Lattuada et al. 2025). That exponent points to a broad spread of speeds and a mean speed of about 2.2 v\u2080. Here as a dilute sample; cells 4 x 0.8 " + MU + "m, spread 50 % and share assumed." },
    chlamy: { label: "Chlamydomonas reinhardtii (alga): swims with a breaststroke", set: Object.assign({}, BFOBJ("CFI Plan Fluor 4X", 0.1), { shape: "sphere", diameter_um: 10, phi: 0.01, cell_um: 200, swim_frac: 0.9, swim_v: 89.6, swim_spread: 0.28, swim_rot: 0.2, swim_osc_amp: 0.98, swim_osc_hz: 48.6, swim_osc_dir: "along", roi: 256, frame_rate_hz: 500, exposure_ms: 0.5, n_frames: 512 }),
      text: "Wild type CCAP 11/32B, about 10 " + MU + "m. Each stroke of the two flagella pulls the cell forward and part of the way back: mean speed 89.6 " + MU + "m/s, spread 24.9 " + MU + "m/s, back-and-forth of 0.98 " + MU + "m at 48.6 Hz; 4x bright field at 1000 frames/s (Martinez et al. 2012). Share assumed. Its helical path (Croze et al. 2019) is not simulated." },
    euglena: { label: "Euglena gracilis (alga), in the dark", set: Object.assign({}, BFOBJ("CFI Plan Achromat 1X", 0.03), { diameter_um: 50, aspect: 5, phi: 0.01, cell_um: 150, swim_frac: 0.9, swim_v: 80, swim_spread: 0.17, swim_rot: 0.011, frame_rate_hz: 25, exposure_ms: 5, n_frames: 512 }),
      text: "About 50 x 10 " + MU + "m. In the dark: speed 79.7 " + MU + "m/s and straight runs over about 3.7 mm (Li et al. 2025, bright field at 10 frames/s). Here 1x bright field at 25 frames/s. The runs are set by a slow wobble of the direction; the Levy walks of that paper are not simulated. Share assumed. The cells are long: a swimmer shows patterns along its own axis only faintly, which the model takes into account (see the card Long cells); patterns finer than a cell are left out." },
    euglena_light: { label: "Euglena gracilis in blue light (0.6 W/m\u00b2)", set: Object.assign({}, BFOBJ("CFI Plan Achromat 1X", 0.03), { diameter_um: 50, aspect: 5, phi: 0.01, cell_um: 150, swim_frac: 0.9, swim_v: 63, swim_spread: 0.17, swim_rot: 0.26, frame_rate_hz: 25, exposure_ms: 5, n_frames: 512 }),
      text: "Blue light makes the cells turn more: speed 63 " + MU + "m/s and runs of only about 120 " + MU + "m (Li et al. 2025)." },
    sperm: { label: "Bull sperm, fresh, diluted 25 times", set: Object.assign({}, BFOBJ("CFI Plan Achromat 2X", 0.05), { shape: "sphere", diameter_um: 5, phi: 0.004, cell_um: 50, T_C: 37, swim_frac: 0.61, swim_v: 111, swim_spread: 0.43, swim_rot: 0.2, swim_osc_amp: 4.2, swim_osc_hz: 16, swim_osc_dir: "across", roi: 256, frame_rate_hz: 200, exposure_ms: 0.5, n_frames: 512 }),
      text: "Speed 111 " + MU + "m/s, spread 48 " + MU + "m/s, 61 % swimming, head moving sideways by 4.2 " + MU + "m at 16 Hz, at 37 " + DEG + "C (Jepson et al. 2019). The head is drawn as a 5 " + MU + "m ball; the cells are denser here than in the paper, for a fair count in this small field." },
    sperm_50: { label: "Bull sperm, fresh, diluted 50 times", set: Object.assign({}, BFOBJ("CFI Plan Achromat 2X", 0.05), { shape: "sphere", diameter_um: 5, phi: 0.004, cell_um: 50, T_C: 37, swim_frac: 0.25, swim_v: 107, swim_spread: 0.43, swim_rot: 0.2, swim_osc_amp: 4.0, swim_osc_hz: 13.6, swim_osc_dir: "across", roi: 256, frame_rate_hz: 200, exposure_ms: 0.5, n_frames: 512 }),
      text: "25 % swimming, 107 " + MU + "m/s, head 4.0 " + MU + "m at 13.6 Hz (Jepson et al. 2019; spread as for the 25-fold sample)." },
    sperm_thawed: { label: "Bull sperm, frozen and thawed", set: Object.assign({}, BFOBJ("CFI Plan Achromat 2X", 0.05), { shape: "sphere", diameter_um: 5, phi: 0.004, cell_um: 50, T_C: 37, swim_frac: 0.42, swim_v: 82, swim_spread: 0.43, swim_rot: 0.2, swim_osc_amp: 3.2, swim_osc_hz: 14, swim_osc_dir: "across", roi: 256, frame_rate_hz: 200, exposure_ms: 0.5, n_frames: 512 }),
      text: "42 % swimming, 82 " + MU + "m/s, head 3.2 " + MU + "m at 14 Hz (Jepson et al. 2019)." },
    sperm_dead: { label: "Bull sperm, thawed and mixed with dead cells", set: Object.assign({}, BFOBJ("CFI Plan Achromat 2X", 0.05), { shape: "sphere", diameter_um: 5, phi: 0.004, cell_um: 50, T_C: 37, swim_frac: 0.15, swim_v: 76, swim_spread: 0.43, swim_rot: 0.2, swim_osc_amp: 2.6, swim_osc_hz: 17, swim_osc_dir: "across", roi: 256, frame_rate_hz: 200, exposure_ms: 0.5, n_frames: 512 }),
      text: "15 % swimming, 76 " + MU + "m/s, head 2.6 " + MU + "m at 17 Hz (Jepson et al. 2019)." },
    custom: { label: "Your own cells: choose their shape, size and swimming", set: null,
      text: "Starts from the cells shown now; shape, size and material are then yours to set." },
  };
  let state = Object.assign({}, BASE);
  const LEVEL_RANK = { curious: 1, student: 2, researcher: 3, addict: 4 };
  let level = "curious";

  function fmtSize(um) { return um < 1 ? Math.round(um * 1000) + " nm" : um.toFixed(um < 2 ? 2 : 1) + " " + MU + "m"; }
  function fmtNum(v) { return v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function fmtSig(v, d) { if (!Number.isFinite(v)) return "-"; if (v === 0) return "0"; const p = Math.pow(10, d - 1 - Math.floor(Math.log10(Math.abs(v)))); return (Math.round(v * p) / p).toString(); }
  function fmtTime(s) { return s < 1 ? fmtSig(s * 1000, 2) + " ms" : fmtSig(s, 2) + " s"; }
  function fmtDur(s) { return s < 120 ? fmtTime(s) : s < 7200 ? fmtSig(s / 60, 2) + " min" : fmtSig(s / 3600, 2) + " h"; }
  // frame timing: log-spaced frames in a repeating cycle, the movie log_factor times longer (movie.js logTimes)
  function BURSTS() { return state.frame_timing === "log" && state.log_factor > 1; }
  function nFrames() { return Math.min(state.n_frames, maxFrames(simPx())); }
  function movieSpanS(stretch) {
    const T = nFrames(), dt = 1 / state.frame_rate_hz, k = stretch === undefined ? (BURSTS() ? state.log_factor : 1) : stretch;
    return k > 1 ? MOVIE.logTimes(T, dt, k)[T - 1] + dt : T * dt;
  }
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
  // swimmer model of the analysis: automatic = in the image plane for swimmers along the glass, with the depth response
  // of the microscope for the confocal modes (swimmers leave the thin slice), Wilson's 3D model otherwise
  function swimModel() {
    if (state.swim_model !== "auto") return state.swim_model;
    if (state.swim_geom === "glass") return "plane";
    if (state.mode === "spinning" || state.mode === "scanning") return "depth";
    return state.swim_osc_amp > 0 ? (state.swim_osc_dir === "across" ? "strokex" : "stroke") : "wilson";
  }
  const MODEL_LABEL = { wilson: "3D swimmers (Wilson et al. 2011)", depth: "3D swimmers seen through the depth of field", plane: "swimmers in the image plane",
    stroke: "3D swimmers with a stroke along their path (Martinez et al. 2012)", strokex: "3D swimmers with a sideways stroke" };
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
    if (state.settle !== "on") return "Particles are spread evenly through the chamber and diffuse freely.";
    const g = geometry(), T = state.T_C + 273.15, kT = 1.380649e-23 * T, lam = centralWavelength();
    const rp = state.particle === "custom" ? state.rho_custom : OPTICS.particleDensity(state.particle), rl = OPTICS.liquidDensity(liquidSpec(), state.T_C);
    const F = (rp - rl) * 1000 * g.volume * 1e-18 * 9.81, lg = Math.abs(F) > 0 ? kT / Math.abs(F) * 1e6 : Infinity;
    const where = !isFinite(lg) || lg > 3 * state.cell_um ? "they stay spread through the chamber" : (F > 0 ? "they collect within about " + fmtSig(lg, 2) + " " + MU + "m of the bottom" : "they float to within about " + fmtSig(lg, 2) + " " + MU + "m of the top");
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
      frame_rate_hz: state.frame_rate_hz, exposure_s: SCANNING() ? 0 : state.exposure_ms / 1000,
      log_timing: BURSTS() ? { factor: state.log_factor } : null,
      particle: state.particle === "custom" ? { n: state.n_custom, rho: state.rho_custom } : state.particle, diameter_um: state.diameter_um, size_distribution: state.size_dist, size_spread: state.size_spread,
      shape: state.shape, aspect: BODY() ? Math.max(state.shape === "rod" ? 2 : 1, state.aspect) : 1, birefringence: state.shape === "sphere" || !TRANS() ? 0 : state.shape === "bisphere" ? state.dn : state.dn_body, polarization: polarization(),
      volume_fraction: state.phi, liquid: liquidSpec(), T_C: state.T_C, cell_um: state.cell_um, focus_um: state.focus_frac * state.cell_um,
      drift_um_s: state.drift_um_s, gravity: false, walls: state.swim_geom === "glass", vector: useVector(),
      // rods narrower than the smallest spot the optics make are drawn as a line of points (much faster)
      thin_bodies: state.shape !== "sphere" && state.diameter_um / Math.max(1, state.aspect) < spotWidth(),
      swim: { fraction: state.swim_frac, v_um_s: state.swim_v, v_spread: state.swim_spread, rot_diff_s: state.swim_rot, tumble_hz: state.swim_tumble,
              plane_fraction: state.swim_geom === "glass" ? 1 : 0, plane_still: state.swim_geom === "glass", height_um: glassHeight(),
              osc_amp_um: state.swim_osc_amp, osc_hz: state.swim_osc_hz, osc_dir: state.swim_osc_dir },
      drag_factor: state.drag
    };
  }
  // automatic upper end of the q range for long cells: patterns at least as wide as a cell is long (q below 2 pi / length).
  // The swimmer model weighs each swimmer by how its image shows the pattern along its direction of travel; finer
  // patterns depend on details of the image of a thick cell (in bright field at low NA) that the model leaves out
  function autoQmax() { return state.shape === "sphere" || state.swim_frac === 0 ? null : 2 * Math.PI / Math.max(0.3, state.diameter_um); }   // long cells only (see the card "Long cells")
  function analysisOptions() { const m = swimModel(); return { q_min_per_um: state.q_min, q_max_per_um: state.q_max !== null ? state.q_max : autoQmax(), beta: null, kind: m === "plane" ? "2d" : "3d", depth: m === "depth", stroke: m === "stroke" || m === "strokex", stroke_dir: m === "strokex" ? "across" : "along", D_from_cells: state.x_dcells !== "off", tumbles: state.swim_tumble > 0 && state.x_tumble !== "off", windowing: state.windowing === "on",
    // what this page adds to Wilson's model, each switchable at the "Addict" level, where the published model alone
    // also runs on the same movie for comparison
    noise: state.x_noise === "off" ? "fit" : undefined, cell_shape: state.x_shape === "off" ? false : undefined, turn_perq: state.x_turn !== "off", swim_turning: state.x_turn !== "off",
    swim_axial: state.x_axial !== "off", amplitude_limits: state.x_amp !== "off", window_fix: state.x_window !== "off", compare_published: level === "addict" }; }
  // centre height of cells lying on the bottom glass: half their thickness plus a 0.2 um gap
  function glassHeight() { const g = geometry(); return Math.min(g.a_par, g.a_perp) + 0.2; }

  // ---- controls -------------------------------------------------------------------
  const TRANS = function () { return state.mode === "brightfield" || state.mode === "phase" || state.mode === "darkfield" || state.mode === "dic"; };
  const BF = function () { return state.mode === "brightfield" || state.mode === "dic"; };              // condenser aperture in use
  const FL = function () { return !TRANS(); };
  const BODY = function () { return state.shape === "prolate" || state.shape === "oblate" || state.shape === "rod"; };
  // the shape, size and material of the cells belong to the organism; they are set by hand only for "your own cells"
  const OWN = function () { return state.organism === "custom"; };
  function cellText() {
    const L = state.diameter_um, sp = state.organism.indexOf("sperm") === 0;
    if (sp) return "Cells: the sperm heads, taken as spheres " + fmtSize(L) + " across (the tail is too thin to show at this magnification).";
    if (state.shape === "rod") return "Cells: rods " + fmtSize(L) + " long and " + fmtSize(L / Math.max(2, state.aspect)) + " wide.";
    if (state.shape === "sphere") return "Cells: round, " + fmtSize(L) + " across.";
    return "";
  }
  const TURNS = function () { return state.shape !== "sphere"; };
  const objOptions = function () { return OBJECTIVES.map(function (o, i) { return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + (o.im !== "dry" ? ", " + o.im : "") + ")", o.s]; }); };
  const CONTROLS = [
    { key: "organism", group: "Sample", lvl: 1, label: "Organism", kind: "select", options: Object.keys(ORGANISMS).map(function (k) { return [k, ORGANISMS[k].label]; }), hint: function () { const o = ORGANISMS[state.organism]; return (o ? o.text : "") + (OWN() ? "" : " " + cellText() + " The shape and size come with the organism (choose \"Your own cells\" to change them); the swimming and the microscope can be changed freely.") + " " + shapeHint(); } },
    { key: "shape", group: "Sample", lvl: 1, label: "Cell shape", kind: "select", when: OWN, options: function () { return Object.keys(SHAPES).filter(function (k) { return state.mode !== "dic" || k === "sphere"; }).map(function (k) { return [k, SHAPES[k]]; }); }, hint: function () { return state.mode === "dic" ? "DIC is simulated for spheres only." : shapeHint(); } },
    { key: "swim_frac", group: "Sample", lvl: 1, label: "Share of cells that swim", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, hint: "The others only diffuse (dead or non-motile cells)." },
    { key: "swim_v", group: "Sample", lvl: 1, label: "Mean swimming speed", kind: "log", min: 1, max: 200, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m/s"; } },
    { key: "swim_spread", group: "Sample", lvl: 2, label: "Spread of speeds (relative standard deviation)", kind: "lin", min: 0.05, max: 0.9, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, hint: "Schulz (gamma) distribution of speeds, as in Wilson et al. 2011." },
    { key: "swim_geom", group: "Sample", lvl: 1, label: "Where they swim", kind: "select", options: [["3d", "Everywhere in the chamber, in all directions"], ["glass", "Along the bottom glass, in the plane"]], hint: function () { return state.swim_geom === "glass" ? "All cells lie on the glass, " + fmtSig(glassHeight(), 2) + " " + MU + "m above it at their centre; the focus is put there. Many bacteria swim this way near surfaces." : ""; } },
    { key: "swim_tumble", group: "Sample", lvl: 2, label: "Tumbles (new random direction)", kind: "lin", min: 0, max: 5, step: 0.1, fmt: function (v) { return v === 0 ? "none: straight runs" : fmtSig(v, 2) + " per second"; }, hint: function () { return state.swim_tumble > 0 ? "A run lasts " + fmtSig(1 / state.swim_tumble, 2) + " s on average, about " + fmtSig(state.swim_v / state.swim_tumble, 2) + " " + MU + "m. The swimmer models assume straight runs, so the largest patterns read slow." : "E. coli tumbles about once per second; smooth-swimming mutants do not."; } },
    { key: "swim_rot", group: "Sample", lvl: 3, label: "Rotational diffusion of swimmers", kind: "log", min: 0.01, max: 5, fmt: function (v) { return fmtSig(v, 2) + " s\u207b\u00b9"; }, hint: "Slow wobbling of the swimming direction (about 0.1 s\u207b\u00b9 for E. coli)." },
    { key: "swim_osc_amp", group: "Sample", lvl: 2, label: "Stroke: back-and-forth of each swimmer", kind: "lin", min: 0, max: 10, step: 0.1, fmt: function (v) { return v === 0 ? "none" : fmtSig(v, 2) + " " + MU + "m"; }, hint: "Algae and sperm do not swim smoothly: each beat moves the cell (or the head) back and forth about its mean path." },
    { key: "swim_osc_hz", group: "Sample", lvl: 2, label: "Stroke: beats per second", kind: "log", min: 1, max: 100, fmt: function (v) { return fmtSig(v, 3) + " Hz"; }, when: function () { return state.swim_osc_amp > 0; }, hint: function () { return state.frame_rate_hz < 2.2 * state.swim_osc_hz ? "The camera takes fewer than two frames per beat: the stroke cannot be seen." : ""; } },
    { key: "swim_osc_dir", group: "Sample", lvl: 3, label: "Stroke: direction", kind: "select", options: [["along", "Along the swimming direction (Chlamydomonas)"], ["across", "Across it (sperm head)"]], when: function () { return state.swim_osc_amp > 0; } },
    { key: "drag", group: "Sample", lvl: 3, label: "Drag relative to a plain rod of this size", kind: "log", min: 0.5, max: 3, fmt: function (v) { return fmtSig(v, 2) + "x"; }, hint: function () { return "Diffusion of the cells: " + fmtSig(hydro().D_t / state.drag, 2) + " " + MU + "m\u00b2/s. Flagella, turning or not, add drag."; } },
    { key: "particle", group: "Sample", lvl: 3, label: "Material", kind: "select", when: OWN, options: function () { return SHAPE_MATERIALS[state.shape].map(function (k) { return [k, MATERIALS[k]]; }); } },
    { key: "n_custom", group: "Sample", lvl: 1, label: function () { return state.shape === "bisphere" ? "Ordinary refractive index (n_o)" : "Particle refractive index"; }, kind: "lin", min: 1.3, max: 2.6, step: 0.01, fmt: function (v) { return v.toFixed(2); }, when: function () { return state.particle === "custom"; } },
    { key: "diameter_um", group: "Sample", lvl: 2, label: function () { return SIZE_LABEL[state.shape]; }, kind: "log", when: OWN, min: 0.3, max: 60, fmt: fmtSize },
    { key: "aspect", group: "Sample", lvl: 2, label: function () { return ASPECT_LABEL[state.shape] || "Aspect ratio"; }, kind: "log", min: 1.2, max: 20, fmt: function (v) { return fmtSig(Math.max(state.shape === "rod" ? 2 : 1, v), 2); }, when: function () { return OWN() && BODY(); }, hint: function () { return state.shape === "rod" && state.aspect < 2 ? "Rods are simulated from aspect ratio 2 (the friction formulas hold from there)." : ""; } },
    { key: "phi", group: "Sample", lvl: 2, label: "Concentration (volume fraction)", kind: "log", min: 1e-6, max: 5e-2, fmt: fmtPhi, hint: function () { return particleCount() + " cells in the simulated volume." + (phiCapped ? " Lowered to fit what the browser can follow (" + MAX_PARTICLES + " cells even in the smallest simulated field)." : "") + (phiRaised ? " Raised so that a few cells are in the simulated field." : ""); } },
    { key: "liquid", group: "Sample", lvl: 2, label: "Liquid", kind: "select", options: Object.keys(LIQUIDS).map(function (k) { return [k, LIQUIDS[k]]; }) },
    { key: "glycerol_w", group: "Sample", lvl: 2, label: "Glycerol (by mass)", kind: "lin", min: 0, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.liquid === "glycerol"; } },
    { key: "n_liquid", group: "Sample", lvl: 3, label: "Liquid refractive index", kind: "lin", min: 1.30, max: 1.60, step: 0.005, fmt: function (v) { return v.toFixed(3); }, when: function () { return state.liquid === "custom"; } },
    { key: "visc_mPa_s", group: "Sample", lvl: 3, label: "Liquid viscosity", kind: "log", min: 0.3, max: 1000, fmt: function (v) { return fmtSig(v, 2) + " mPa s"; }, when: function () { return state.liquid === "custom"; } },
    { key: "T_C", group: "Sample", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; } },
    { key: "cell_um", group: "Sample", lvl: 2, label: "Chamber thickness", kind: "log", min: 1, max: 500, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m"; }, hint: function () { return particleCount() > 30000 ? "Too many particles for the browser (" + particleCount() + "): lower the concentration or simulate a smaller part of the image." : state.mode === "dic" && state.cell_um >= 200 ? "DIC is simulated in cells up to 200 " + MU + "m." : state.cell_um > 60 ? "Thick cells take longer to simulate (up to about 20 s): far from focus each particle's image changes with depth in many ways." : ""; } },
    { key: "focus_frac", group: "Sample", lvl: 2, label: "Focus height in the chamber", kind: "lin", min: 0, max: 1, step: 0.05, fmt: function (v) { return fmtSig(v * state.cell_um, 2) + " " + MU + "m above the bottom"; } },
    { key: "drift_um_s", group: "Sample", lvl: 2, label: "Drift (flow to the right)", kind: "lin", min: 0, max: 20, step: 0.5, fmt: function (v) { return v.toFixed(1) + " " + MU + "m/s"; } },

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
    { key: "polarizer", group: "Illumination", lvl: 2, label: "Polarizer before the sample", kind: "select", options: [["off", "None"], ["on", "Linear polarizer"]], when: function () { return TRANS() && state.mode !== "dic"; }, hint: function () { return state.polarizer === "on" ? "Light polarized along x." + (state.analyzer !== "on" ? " Without an analyzer, anisotropic particles look brighter or darker as they turn." : "") : TURNS() && state.analyzer !== "on" ? "Turning particles show best between polarizers (birefringent ones) or in dark field." : ""; } },
    { key: "analyzer", group: "Detection", lvl: 2, label: "Analyzer after the sample", kind: "select", options: [["off", "None"], ["on", "Linear polarizer (analyzer)"]], when: function () { return TRANS() && state.mode !== "dic"; }, hint: polHint },
    { key: "pol_angle_deg", group: "Detection", lvl: 2, label: "Angle between polarizer and analyzer", kind: "lin", min: 0, max: 90, step: 1, fmt: function (v) { return Math.round(v) + DEG + (Math.round(v) === 90 ? " (crossed)" : Math.round(v) === 0 ? " (parallel)" : ""); }, when: function () { return TRANS() && state.mode !== "dic" && state.polarizer === "on" && state.analyzer === "on"; } },
    { key: "extinction", group: "Detection", lvl: 3, label: "Polarizer leak (light passing crossed polarizers)", kind: "log", min: 1e-6, max: 1e-2, fmt: fmtPhi, when: function () { return TRANS() && state.mode !== "dic" && state.polarizer === "on" && state.analyzer === "on"; }, hint: "Real pairs in a microscope pass about 1e-4 to 1e-3 of the light when crossed." },
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
      hint: function () { return BURSTS() ? "The same " + nFrames() + " frames cover " + fmtDur(movieSpanS()) + " instead of " + fmtDur(nFrames() / state.frame_rate_hz) + ". In each cycle the first frames follow at the frame rate, then the gaps grow by a fixed factor; the cycle repeats." : "All frames one frame interval apart: " + fmtDur(nFrames() / state.frame_rate_hz) + " of movie."; } },
    { key: "log_factor", group: "Camera and recording", lvl: 2, label: "Log-spaced: how much longer the movie lasts", kind: "select", num: true, when: function () { return state.frame_timing === "log"; },
      options: function () { return [5, 10, 20, 50].map(function (k) { return [k, k + " times (" + fmtDur(movieSpanS(k)) + ")"]; }); } },
    { key: "sim_px", group: "Camera and recording", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]] },

    { key: "windowing", group: "Analysis", lvl: 2, label: "Windowing (Giavazzi et al. 2017)", kind: "select", options: [["off", "Off"], ["on", "On: each frame multiplied by a window that falls to zero at the edges"]],
      hint: function () { return state.windowing === "on" ? "Cells or particles that cross the edge of the image no longer leave bands along the axes of the map in step 4, nor a fast decay that swamps the finest patterns. The price: the window darkens the edges, so less of the field counts and the results scatter more, and patterns wider than a fifth of the field are left out (the window mixes each pattern with its neighbours)." : "The Fourier transform treats the image as one tile of a repeating pattern, so cells or particles crossing the edges make jumps at the tile borders. The central cross of the map is left out to remove most of their effect."; } },
    { key: "swim_model", group: "Analysis", lvl: 2, label: "Swimmer model fitted to all q", kind: "select", options: [["auto", "Automatic"], ["wilson", MODEL_LABEL.wilson], ["depth", MODEL_LABEL.depth], ["plane", MODEL_LABEL.plane], ["stroke", MODEL_LABEL.stroke], ["strokex", MODEL_LABEL.strokex]], hint: function () { return "In use: " + MODEL_LABEL[swimModel()] + "." + (swimModel() === "depth" ? " Uses how each pattern fades as a cell moves up or down through the focus, computed from the optics of this microscope." : ""); } },
    { key: "qrange", group: "Analysis", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  // "Addict": the additions to Wilson's model, one switch each (see "What this page adds" on the page)
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_noise", lvl: 4, label: "Camera noise known from the detector", kind: "select", options: ONOFF("B fitted at each q"),
      hint: function () { return "On: B = 2 (excess-noise factor x mean count + read noise\u00b2), the same at every q. Off: B fitted at each q, as published."; } },
    { key: "x_shape", lvl: 4, label: "Shape of the cells", kind: "select", options: ONOFF("cells as points, as in Wilson's model"),
      hint: function () { return "On: each direction of swimming weighted by how a rod of this length and width shows at that q. Matters for long cells and fine patterns."; } },
    { key: "x_dcells", lvl: 4, label: "Expected diffusion of the cells", kind: "select", options: ONOFF("D always fitted"),
      hint: function () { return "On: D fixed at the value expected from the size and shape of the cells and the viscosity, when the data do not ask for another one; and the share of swimmers from the amplitude when the still cells barely move."; } },
    { key: "x_turn", lvl: 4, label: "Turning of the cells", kind: "select", options: ONOFF("no fading as rods turn"),
      hint: function () { return "On: rods, still or swimming, also fade from each pattern as they turn (a share b at each q, rate 6 D_R for the still ones, 6 D_s for the swimmers)."; } },
    { key: "x_tumble", lvl: 4, label: "Tumbles", kind: "select", options: ONOFF("straight runs only"), when: function () { return state.swim_tumble > 0; },
      hint: function () { return "On: for cells known to tumble, the swimmers' images also fade at the tumble rate, fitted."; } },
    { key: "x_axial", lvl: 4, label: "Swimmers leave the focus", kind: "select", options: ONOFF("only the still cells fade with depth"),
      hint: function () { return "On, with the depth-of-field model: the swimmers also diffuse up and down and fade through the optics, as the still cells do."; } },
    { key: "x_amp", lvl: 4, label: "Limits on the amplitude", kind: "select", options: ONOFF("A free at each q"),
      hint: function () { return "On: A of each q stays below the whole amplitude from the mean power of the images and below three times twice the variance in time, so dead cells do not pass for slow swimmers."; } },
    { key: "x_window", lvl: 4, label: "Window corrections", kind: "select", options: ONOFF("the window as in the paper"), when: function () { return state.windowing === "on"; },
      hint: function () { return "On: patterns below 5 steps in q are left out, because the window mixes neighbouring patterns. Off: only those below 2 steps."; } }
  );
  // where each control sits: the imaging mode, then everything about the sample, the light reaching it, and how the
  // light is collected and recorded. Every control appears exactly once (checked at start-up).
  const LAYOUT = [
    ["Sample", [
      ["Cells", ["organism", "shape", "particle", "n_custom", "diameter_um", "aspect", "phi", "dye"]],
      ["Swimming", ["swim_frac", "swim_v", "swim_spread", "swim_geom", "swim_tumble", "swim_rot", "swim_osc_amp", "swim_osc_hz", "swim_osc_dir", "drag"]],
      ["Liquid and temperature", ["liquid", "glycerol_w", "n_liquid", "visc_mPa_s", "T_C"]],
      ["Chamber", ["cell_um", "drift_um_s"]]]],
    ["Microscope (Nikon Ti2-E)", [
      ["", ["mode"]],
      ["Illumination", ["source", "condenser", "na_c", "df_kind", "annulus", "polarizer", "light_frac", "df_light_e", "stray_frac", "rate_ph_ms", "bg_e_ms", "scan_rate"]],
      ["Objective and contrast", ["objective", "optics", "focus_frac", "ring_T", "dic_bias_deg", "dic_shear_um", "dic_angle_deg", "analyzer", "pol_angle_deg", "extinction"]]]],
    ["Camera and recording", [
      ["", ["camera", "cam_mode", "iface", "roi", "binning"]],
      ["Point scanner (Nikon AX R)", ["scanner", "scan_px", "zoom", "line_avg", "pinhole_au"]],
      ["Timing", ["frame_rate_hz", "exposure_ms", "n_frames", "frame_timing", "log_factor", "sim_px"]]]],
    ["Analysis", [
      ["", ["swim_model", "windowing", "qrange"]],
      ["Addict: what this page adds", ["x_noise", "x_shape", "x_dcells", "x_turn", "x_tumble", "x_axial", "x_amp", "x_window"]]]]
  ];
  // one-line summary under each block title: [setting, text before, text after]
  const SUMMARY = {
    "Sample": [["organism"], ["swim_frac", "", " swim"], ["swim_v", "at "], ["cell_um", "chamber "]],
    "Microscope (Nikon Ti2-E)": [["mode"], ["objective"], ["na_c", "condenser NA "]],
    "Camera and recording": [["camera"], ["scanner"], ["frame_rate_hz"], ["exposure_ms", "exposure "], ["n_frames", "", " frames"]],
    "Analysis": [["swim_model", "model: "], ["windowing"]]
  };
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (sb) { sb[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; c.sub = sb[0]; out.push(c); delete byKey[k]; }); }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { swim_model: 1, q_min: 1, q_max: 1, windowing: 1, x_noise: 1, x_shape: 1, x_dcells: 1, x_turn: 1, x_tumble: 1, x_axial: 1, x_amp: 1, x_window: 1 };
  function fmtRate(v) { return fmtSig(v, 2) + " s" + "\u207b\u00b9"; }
  function shapeHint() {
    const hh = hydro();
    if (level === "curious") return "A cell that does not swim wanders at random, about " + fmtSig(Math.sqrt(4 * hh.D_t), 2) + " " + MU + "m in a second" + (TURNS() ? ", and slowly turns." : ".");
    return "Diffusion of a cell that does not swim: D = " + fmtSig(hh.D_t, 2) + " " + MU + "m\u00b2/s" + (TURNS() ? "; it turns with D_R = " + fmtSig(hh.D_r, 2) + " s\u207b\u00b9." : ".");
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
        const d = document.createElement("details"); d.className = "cblock"; d.open = true; d.dataset.block = c.group.split(" ")[0].toLowerCase();   // its colour
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
        wrap.innerHTML = '<label></label><div class="qrange"><input type="number" id="c-qmin" step="0.1" min="0" placeholder="from: auto" aria-label="Lowest q"><input type="number" id="c-qmax" step="0.1" min="0" placeholder="to: auto" aria-label="Highest q"></div><div class="hint">Leave empty for the automatic range: everything measurable, up to q = 3 / cell length.</div>';
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
    if (state.mode === "dic") { if (state.shape !== "sphere") { state.shape = "sphere"; if (!OWN()) state.organism = "custom"; } if (state.cell_um > 200) state.cell_um = 200; }   // limits of the DIC model
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
    if (key === "organism") {
      if (state.organism === "custom") { syncControls(); return; }   // the cells shown now become the starting point
      applyPreset(Object.assign({ organism: state.organism }, ORGANISMS[state.organism].set)); return;
    }
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
    if (key === "swim_geom" || key === "cell_um") { if (state.swim_geom === "glass") state.focus_frac = Math.min(1, glassHeight() / state.cell_um); else if (key === "swim_geom") state.focus_frac = 0.5; }
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
    // controls hidden at this level go back to the standard value of the chosen organism (its size and shape, not those of
    // the example cells), so the bench shows what is simulated
    let changed = false, changedAna = false;   // a setting of the movie, or only of the analysis
    const std = Object.assign({}, BASE, state.organism !== "custom" && ORGANISMS[state.organism] ? ORGANISMS[state.organism].set : {});
    CONTROLS.forEach(function (c) {
      if (c.lvl <= LEVEL_RANK[lv] || c.key === "organism") return;
      if (c.kind === "qrange") { if (state.q_min !== std.q_min || state.q_max !== std.q_max) { state.q_min = std.q_min; state.q_max = std.q_max; changed = true; } return; }
      if (state.organism === "custom" && (c.key === "diameter_um" || c.key === "aspect" || c.key === "particle")) return;   // your own cells keep their size
      if (state[c.key] !== std[c.key]) { state[c.key] = std[c.key]; if (ANALYSIS_KEYS[c.key]) changedAna = true; else changed = true; }
    });
    if (LEVEL_RANK[lv] < 3 && state.seed !== BASE.seed) { state.seed = BASE.seed; changed = true; }
    if (curveView === "d" && lv === "curious") setCurveView("change");
    if (fromUser && location.hash !== "#" + lv) { try { history.replaceState(null, "", "#" + lv); } catch (e) { /* sandboxed previews (about:srcdoc) refuse it */ } }
    constrain(); syncControls(); drawFov();
    // the "published model only" row is computed at the "Addict" level only
    if (changed) schedule(); else if (changedAna || (cache.res && lv === "addict" && !cache.res.published)) scheduleAnalysis(); else if (cache.res) renderAll();
  }

  // ---- running (in a background worker when the browser allows it) --------------------
  const cache = { movie: null, res: null, cfg: null, opts: null };
  let timer = null, worker = null, runToken = 0, workerOK = true;
  function workerSource() {
    return ["optics-src", "movie-src", "engine-src", "active-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent;
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
  function repeatRun(sm) { return sm.v === null ? null : sm; }
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
          const r = await drive(ACTIVE.analyse(mv, opts), token, (k + 0.85) / 5, (k + 1) / 5); if (!r) return;
          got(ACTIVE.summary(r, mv));
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
    const res = await drive(ACTIVE.analyse(movie, opts), token, 0.85, opts.compare_published ? 0.92 : 1);
    if (!res) return;
    if (opts.compare_published) { const rp = await drive(ACTIVE.analyse(movie, Object.assign({}, opts, { published_only: true, jackknife: false })), token, 0.92, 1); if (!rp) return; res.published = ACTIVE.publishedSummary(rp); }
    inflight = null;
    finish(movie, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  function finish(movie, res, cfg, opts) {
    if (runStart) { const s = (performance.now() - runStart) / 1000; if (movie !== cache.movie) lastRunS = s; }
    repeat = null;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    res.used = res.fits.filter(function (f) { return f.reason === null; });
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames of " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " cells."; idle();
    frameIdx = 0;
    renderAll();
  }
  // model curve of one q (computed by the analysis on a fine grid of delays), interpolated in log delay
  function modelAt(f, t) {
    const taus = cache.res.curve_taus_s || cache.res.taus_s, L = taus.length, c = f.curve;
    if (!c) return NaN;
    if (t <= taus[0]) return c[0];
    if (t >= taus[L - 1]) return c[L - 1];
    let i = 0; while (i < L - 2 && taus[i + 1] < t) i++;
    const g = Math.log(t / taus[i]) / Math.log(taus[i + 1] / taus[i]);
    return c[i] + g * (c[i + 1] - c[i]);
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
    const mv = cache.movie, dt = 1 / mv.frame_rate_hz, fps = Math.max(8, Math.min(60, mv.frame_rate_hz)), speed = fps / mv.frame_rate_hz, tt = mv.times_s;
    if (tt) { $("movie-time").textContent = "Frame " + (frameIdx + 1) + " of " + mv.T + ", taken at t = " + fmtSig(tt[frameIdx], 3) + " s of " + fmtDur(tt[mv.T - 1] + dt) + ". Frames taken at log-spaced times, shown one after the other."; return; }
    $("movie-time").textContent = "t = " + (frameIdx * dt).toFixed(dt < 0.01 ? 3 : dt < 0.1 ? 2 : 1) + " s of " + fmtSig(mv.T * dt, 3) + " s" +
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
  // rate of each q (compressed exponential, where the pattern has changed by 1 - 1/e): swimming makes it grow as q,
  // diffusion as q^2. Lines: v0 q from the measured points (black), D q^2 for the cells that do not swim (grey) and,
  // for the simulated cells, the rate pure swimming at their true speeds would give (dashed red)
  function oneOverE(kind, Z) {     // x = q v dt where the swimmer factor falls to 1/e
    let lo = 0.01, hi = 50; const g = function (x) { return (kind === "2d" ? ACTIVE.swim2(x, Z) : ACTIVE.swim3(x, Z)) - Math.exp(-1); };
    for (let k = 0; k < 60; k++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  }
  function seenTruth() {           // true share and mean speed as seen over the q used
    const res = cache.res, tr = cache.movie.truth.swim, qs = res.used.map(function (f) { return f.q_per_um; });
    const so = ACTIVE.seenOver(tr, qs.length ? qs : [res.window.q_hi_per_um / 3]);
    return { share: so ? so.fraction : tr.fraction, v: so && so.v_mean_um_s ? so.v_mean_um_s : tr.v_mean_um_s, spread: tr.v_sd_um_s / Math.max(1e-9, tr.v_mean_um_s) };
  }
  // What moves, and how: the curves of all used q against q dt (straight swimming: a pattern renews when a cell has
  // swum across it, so the fast step of every q falls on one curve) and against q^2 dt (diffusion: the slow step does)
  function drawCollapse() {
    const res = cache.res, h = res.head, taus = res.taus_s, M = res.master || [];
    ["chart-ballistic", "chart-diffusive"].forEach(function (id, k) {
      const cv = $(id); if (!cv) return;
      const pow = k === 0 ? 1 : 2;
      if (!M.length) { axes(cv, { xlog: true, ylog: false, x0: 0.01, x1: 100, y0: -0.1, y1: 1.1, xlabel: k === 0 ? "q \u0394t (" + MU + "m\u207b\u00b9 s)" : "q\u00b2 \u0394t (" + MU + "m\u207b\u00b2 s)", ylabel: "f" }).done(); return; }
      let x0 = Infinity, x1 = 0; M.forEach(function (m) { const s0 = Math.pow(m.q, pow); x0 = Math.min(x0, s0 * taus[0]); x1 = Math.max(x1, s0 * taus[taus.length - 1]); });
      const a = axes(cv, { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.1, y1: 1.1,
        xlabel: k === 0 ? (level === "curious" ? "pattern fineness x delay (q \u0394t)" : "q \u0394t (" + MU + "m\u207b\u00b9 s)") : (level === "curious" ? "fineness squared x delay (q\u00b2 \u0394t)" : "q\u00b2 \u0394t (" + MU + "m\u207b\u00b2 s)"),
        ylabel: level === "curious" ? "How alike (1 = same)" : "f(q, \u0394t)" });
      const ctx = a.ctx;
      // the level of the cells that do not swim (between the two steps)
      if (h && !h.no_swim) { const y = a.fy(1 - h.alpha); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, y); ctx.lineTo(a.m.l + a.pw, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = h.alpha > 0.85 ? "bottom" : "top"; ctx.fillText("cells that do not swim: " + Math.round(100 * (1 - h.alpha)) + " %", a.m.l + 6, h.alpha > 0.85 ? y - 3 : y + 3); }
      const step = Math.max(1, Math.round(M.length / 14));
      M.forEach(function (m, j) {
        if (j % step) return;
        const s0 = Math.pow(m.q, pow); ctx.strokeStyle = qColor(qPos(m.q)); ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = 0; i < taus.length; i++) { const X = a.fx(s0 * taus[i]), Y = a.fy(Math.max(-0.1, Math.min(1.1, m.f[i]))); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
        ctx.stroke();
      });
      // what each kind of motion predicts on its own axis: swimmers on the left, diffusion on the right
      if (h) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.setLineDash([]); ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const x = x0 * Math.pow(x1 / x0, i / 80); let f;
          if (k === 0) { if (h.no_swim) f = null; else { const cm = res.collapse; let sw;
            if (cm) { const t = Math.log(x / cm.x[0]) / Math.log(cm.x[cm.x.length - 1] / cm.x[0]) * (cm.x.length - 1), j = Math.max(0, Math.min(cm.x.length - 2, Math.floor(t))), fr = Math.max(0, Math.min(1, t - j)); sw = cm.f[j] + fr * (cm.f[j + 1] - cm.f[j]); }
            else sw = ACTIVE.swimF(res.kind === "2d" ? "2d" : "3d", 1, x, { v: h.v_um_s, alpha: 1, spread: h.spread, D: 0 });
            f = (1 - h.alpha) + h.alpha * sw; } }
          else f = (h.no_swim ? 1 : 1 - h.alpha) * Math.exp(-h.D_um2_s * x);
          if (f === null) break;
          const X = a.fx(x), Y = a.fy(Math.max(-0.1, Math.min(1.1, f))); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
      a.done();
    });
  }
  // one paragraph and a bar: who swims, who only diffuses, and the evidence
  function renderMotion() {
    const el = $("motion"); if (!el) return;
    const res = cache.res, h = res.head, st = seenTruth(), tr = cache.movie.truth.swim, c = res.compressed;
    const bar = function (share, label) { const p = Math.round(100 * Math.max(0, Math.min(1, share))); return '<div class="mbar"><span class="mlab">' + label + '</span><span class="mtrack"><span class="msw" style="width:' + p + '%"></span><span class="mdf" style="width:' + (100 - p) + '%"></span></span><span class="mnum">' + p + ' % / ' + (100 - p) + ' %</span></div>'; };
    let html = '<div class="eyebrow">What moves, and how</div>';
    if (!h) { el.innerHTML = html + '<p class="small">Too few usable patterns to tell.</p>'; return; }
    const measured = h.no_swim ? 0 : h.alpha;
    html += '<div class="mkey"><span><i class="msw"></i>swim in straight runs</span><span><i class="mdf"></i>only diffuse</span></div>';
    html += bar(measured, "Measured") + bar(st.share, "True");
    const slope = c ? c.slope : null, tmax = res.taus_s[res.taus_s.length - 1], qhi = res.used.length ? res.used[res.used.length - 1].q_per_um : 1;
    const still = h.D_um2_s * qhi * qhi * tmax;
    let lines = [];
    if (h.no_swim) {
      lines.push("<b>One kind of motion: diffusion.</b> The curves fall on one curve against q\u00b2\u0394t (second chart), not against q\u0394t (first chart): every cell wanders at random" + (TURNS() ? " and turns" : "") + ", D = " + fmtSig(h.D_um2_s, 2) + " " + MU + "m\u00b2/s. Nothing swims." + (TURNS() ? " The widest patterns (blue) fade sooner than the others: for them it is the turning of the rods, not their wandering, that renews the pattern." : ""));
    } else {
      lines.push("<b>Swimmers, " + Math.round(100 * h.alpha) + " % of the signal:</b> " + (state.swim_tumble > 0 ? "runs broken by tumbles" : state.swim_osc_amp > 0 ? "runs with a back-and-forth stroke" : "straight runs") + ". The fast first step of every curve falls on one curve against q\u0394t (first chart; thick line: the swimmer model), as it must for motion at constant speed: a pattern renews when a cell has swum across it. Mean speed " + fmtV(h.v_um_s) + (res.fast && level !== "curious" ? "; the swimmers' rate per q rises with slope " + res.fast.slope.toFixed(2) + " (rate chart)" : "") + ".");
      lines.push("<b>The others, " + Math.round(100 * (1 - h.alpha)) + " %:</b> they only diffuse" + (TURNS() ? " and turn (turning rods also pull the curves a little below the dashed level)" : "") + ". The level between the two steps (dashed) is their share; their slow final step falls on one curve against q\u00b2\u0394t (second chart; thick line: D = " + fmtSig(h.D_um2_s, 2) + " " + MU + "m\u00b2/s)." + (still < 0.5 ? " In this movie they barely move (D q\u00b2\u0394t = " + fmtSig(still, 2) + " at the finest pattern and longest delay), so their step is cut short: their share is read from how far each curve still has to fall." : ""));
    }
    if (tr && tr.n_swimmers > 0 && h && !h.no_swim && Math.abs(h.alpha - st.share) > 0.08) lines.push("The measured share is off by " + Math.round(100 * Math.abs(h.alpha - st.share)) + " points from the truth: see the checks below.");
    el.innerHTML = html + lines.map(function (t) { return '<p class="small" style="margin:0">' + t + '</p>'; }).join("");
  }
  function drawRates() {
    const res = cache.res, w = res.window;
    // used q with swimmers found: the rate of the swimmers' step (the slow part fixed from the swimmer fit); otherwise,
    // and for the q left out, one compressed exponential per q
    const rateOf = function (f) { return res.fast && f.reason === null && f.gamma_fast_hz ? f.gamma_fast_hz : f.gamma_hz; };
    const ok = res.fits.filter(function (f) { const g = rateOf(f); return f.ok && g > 0 && Number.isFinite(g); });
    const x0 = res.q_per_um[1] * 0.8, x1 = res.q_per_um[res.q_per_um.length - 1] * 1.25, y0 = w.gamma_lo_hz / 8, y1 = w.gamma_hi_hz * 8;
    const a = axes($("chart-rates"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1,
      xlabel: level === "curious" ? "Finer patterns \u2192   (wave vector q, " + MU + "m\u207b\u00b9)" : "Wave vector q (" + MU + "m\u207b\u00b9)",
      ylabel: level === "curious" ? "Faster change (1/s)" : "Rate \u0393 (s\u207b\u00b9)" });
    const ctx = a.ctx;
    ctx.fillStyle = C.tint; ctx.globalAlpha = 0.9;
    const shade = function (xa, ya, xb, yb) { ctx.fillRect(a.fx(xa), a.fy(yb), a.fx(xb) - a.fx(xa), a.fy(ya) - a.fy(yb)); };
    shade(x0, y0, 2 * w.q_lo_per_um, y1); shade(w.q_hi_per_um, y0, x1, y1); shade(x0, y0, x1, 3 * w.gamma_lo_hz); shade(x0, w.gamma_hi_hz, x1, y1);
    ctx.globalAlpha = 1; ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    [[3 * w.gamma_lo_hz, "too slow for this movie", "top", 3], [w.gamma_hi_hz, "faster than one frame", "bottom", -3]].forEach(function (hh) { const y = a.fy(hh[0]); ctx.beginPath(); ctx.moveTo(a.m.l, y); ctx.lineTo(a.m.l + a.pw, y); ctx.stroke(); ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = hh[2]; ctx.fillText(hh[1], a.m.l + 6, y + hh[3]); });
    const xq = a.fx(w.q_hi_per_um); ctx.beginPath(); ctx.moveTo(xq, a.m.t); ctx.lineTo(xq, a.m.t + a.ph); ctx.stroke();
    ctx.save(); ctx.translate(xq - 4, a.m.t + 6); ctx.rotate(-Math.PI / 2); ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(w.q_opt_per_um <= w.q_nyq_per_um ? "optical limit" : "pixel limit", 0, 0); ctx.restore();
    ctx.setLineDash([]);
    const line = function (fn, col, dash, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5; ctx.setLineDash(dash || []); ctx.beginPath(); for (let i = 0; i <= 60; i++) { const q = x0 * Math.pow(x1 / x0, i / 60), X = a.fx(q), Y = a.fy(Math.max(y0 / 10, fn(q))); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); ctx.setLineDash([]); };
    // a curve through the values at the used q (the model's rate is not a straight line for long cells)
    const curve = function (key, col, dash, lw) { const pts = res.fits.filter(function (f) { return f.reason === null && f[key] > 0; }); if (pts.length < 2) return; ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5; ctx.setLineDash(dash || []); ctx.beginPath(); pts.forEach(function (f, i) { const X = a.fx(f.q_per_um), Y = a.fy(f[key]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.stroke(); ctx.setLineDash([]); };
    if (res.fast) curve("gamma_model_hz", C.ink, [], 2);
    else if (res.compressed) line(function (q) { return res.compressed.v0_um_s * q; }, C.ink);
    if (res.head && level !== "curious") line(function (q) { return res.head.D_um2_s * q * q; }, C.muted, [2, 3]);
    const tr = cache.movie.truth.swim;
    if (level !== "curious" && tr && tr.n_swimmers > 0) {
      if (res.fast) curve("gamma_true_hz", C["accent-2"], [7, 4]);
      else { const st = seenTruth(), Z = 1 / Math.pow(Math.max(0.05, st.spread), 2) - 1, k = oneOverE(res.kind, Z); line(function (q) { return q * st.v / k; }, C["accent-2"], [7, 4]); }
    }
    ok.forEach(function (f) { const X = a.fx(f.q_per_um), Y = a.fy(rateOf(f)); if (f.reason === null) dot(ctx, X, Y, 3.6, qColor(qPos(f.q_per_um)), null); else dot(ctx, X, Y, 3, null, C.muted); });
    if (sel) { const f = res.fits.find(function (ff) { return ff.bin === selBin(); }); if (f && f.ok) dot(ctx, a.fx(f.q_per_um), a.fy(rateOf(f)), 7, null, C.ink); }
    a.done();
    const counts = {}; res.fits.forEach(function (f) { if (f.reason) counts[f.reason] = (counts[f.reason] || 0) + 1; });
    const ul = $("reasons"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    if (res.fast) add(level === "curious" ? "Dots: how fast the swimmers renew each pattern. Solid line: what the fitted swimmer model predicts. For swimmers the dots rise in step with the fineness of the pattern; for long cells a little more slowly at the finest patterns." : "Dots: rate of the swimmers' step at each q (one exponential exp(-(\u0393 \u0394t)^\u03b2) for the swimmers, with the share, D and turning of the others fixed from the swimmer fit). Solid line: the same rate from the fitted model (1/e of its swimmer part). For point-like swimmers it grows as q (slope 1); long cells grow more slowly at large q (here slope " + res.fast.slope.toFixed(2) + ").");
    else add("Solid line: rate = v\u2080 q, fitted to the points" + (res.compressed ? " (v\u2080 = " + fmtSig(res.compressed.v0_um_s, 3) + " " + MU + "m/s" + (level !== "curious" ? ", slope " + res.compressed.slope.toFixed(2) + " on these axes" : "") + ")" : "") + ". One exponential per q: with no swimmers found, the rate of the whole curve.");
    if (level !== "curious") {
      add("Dotted grey line: D q\u00b2 of the cells that do not swim, from the swimmer model. Swimming gives slope 1, diffusion slope 2.");
      add("Dashed red line: the same model at the true speeds of the simulated cells. It lies below q times the speed: in 3D a pattern has changed by 1 \u2212 1/e when q v \u0394t is about 2.2, because most cells swim at an angle to the stripes.");
    }
    add(res.used.length + " points used.");
    Object.keys(counts).sort(function (p, q) { return counts[q] - counts[p]; }).forEach(function (k) { add(counts[k] + " left out: " + k + "."); });
  }
  // speed from each q alone (swimmer model with the spread and D of all q fixed): flat when the model fits
  function drawSize() {
    if (level === "curious" || !$("chart-size")) return;
    const res = cache.res, h = swimHead(res);
    if (!h || !h.perq || h.perq.length < 2) { axes($("chart-size"), { xlog: true, ylog: false, x0: 0.1, x1: 10, y0: 0, y1: 1, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "Speed (" + MU + "m/s)" }).done(); return; }
    // axis from 0.3 to 2.5 times the result at most: a stray q (few modes, or one the model does not describe) is drawn
    // hollow at the edge instead of squashing the others
    const vlo = 0.3 * h.v_um_s, vhi = 2.5 * h.v_um_s, clip = function (v) { return Math.min(vhi, Math.max(vlo, v)); };
    const st = seenTruth(), vals = h.perq.map(function (e) { return clip(e.v_um_s); }).concat([h.v_um_s, st.v]);
    vals.sort(function (p, q) { return p - q; });
    const lo = vals[0], hi = vals[vals.length - 1], pad = Math.max(0.15 * (hi - lo), 0.1 * hi);
    const q0 = h.perq[0].q / 1.3, q1 = h.perq[h.perq.length - 1].q * 1.3;
    const a = axes($("chart-size"), { xlog: true, ylog: false, x0: q0, x1: q1, y0: Math.max(0, lo - pad), y1: hi + pad, xlabel: "Wave vector q (" + MU + "m\u207b\u00b9)", ylabel: "Speed (" + MU + "m/s)" }), ctx = a.ctx;
    ctx.setLineDash([7, 4]); ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(st.v)); ctx.lineTo(a.m.l + a.pw, a.fy(st.v)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(h.v_um_s)); ctx.lineTo(a.m.l + a.pw, a.fy(h.v_um_s)); ctx.stroke();
    h.perq.forEach(function (e) { const out = e.v_um_s !== clip(e.v_um_s); dot(ctx, a.fx(e.q), a.fy(clip(e.v_um_s)), 3.2, out ? null : qColor(qPos(e.q)), out ? qColor(qPos(e.q)) : null); });
    a.done();
  }
  // speed distribution of the swimmers: true (simulated cells, red steps), the Schulz distribution of the model (black)
  // and the distribution found from the data without assuming a shape (bars); the share of cells that do not swim is
  // given apart (bin at zero speed)
  function lnGamma(z) { const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i); const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
  function schulzPdf(v, vm, spread) { if (v <= 0) return 0; const Z = 1 / (spread * spread) - 1, u = v / vm; return Math.exp((Z + 1) * Math.log(Z + 1) + Z * Math.log(u) - (Z + 1) * u - lnGamma(Z + 1)) / vm; }
  function drawPv() {
    const cv = $("chart-pv"); if (!cv || level === "curious") return;
    const res = cache.res, pv = res.pv, h = swimHead(res), tr = cache.movie.truth.swim;
    let vmax = pv ? pv.v_um_s[pv.v_um_s.length - 1] : 3 * state.swim_v;
    if (!(vmax > 0.01)) vmax = 3 * Math.max(state.swim_v, 1);        // no sensible speed scale (nothing swims)
    const nb = 30, bw = vmax / nb, hist = new Float64Array(nb);
    if (tr && tr.v_list) { for (let i = 0; i < tr.v_list.length; i++) { const k = Math.floor(tr.v_list[i] / bw); if (k >= 0 && k < nb) hist[k]++; } const n = tr.v_list.length || 1; for (let k = 0; k < nb; k++) hist[k] /= n * bw; }
    const data = [];
    if (pv) { let sw = 0; for (let k = 1; k < pv.from_data.length; k++) sw += pv.from_data[k]; for (let k = 1; k < pv.from_data.length; k++) data.push({ v: pv.v_um_s[k], p: sw > 0 ? pv.from_data[k] / (sw * pv.dv) : 0 }); }
    let ymax = 0; hist.forEach(function (v) { ymax = Math.max(ymax, v); }); data.forEach(function (d) { ymax = Math.max(ymax, d.p); });
    if (h) for (let i = 1; i <= 100; i++) ymax = Math.max(ymax, schulzPdf(vmax * i / 100, h.v_um_s, h.spread));
    const a = axes(cv, { xlog: false, ylog: false, x0: 0, x1: vmax, y0: 0, y1: 1.15 * (ymax || 1), xlabel: "Swimming speed (" + MU + "m/s)", ylabel: "Share of swimmers per " + MU + "m/s" }), ctx = a.ctx;
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.35;
    data.forEach(function (d) { const X0 = a.fx(d.v - pv.dv / 2), X1 = a.fx(d.v + pv.dv / 2); ctx.fillRect(X0, a.fy(d.p), Math.max(1, X1 - X0 - 1), a.fy(0) - a.fy(d.p)); });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath();
    for (let k = 0; k < nb; k++) { const X0 = a.fx(k * bw), X1 = a.fx((k + 1) * bw), Y = a.fy(hist[k]); if (k === 0) ctx.moveTo(X0, a.fy(0)); ctx.lineTo(X0, Y); ctx.lineTo(X1, Y); }
    ctx.lineTo(a.fx(nb * bw), a.fy(0)); ctx.stroke();
    if (h) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 1; i <= 120; i++) { const v = vmax * i / 120, X = a.fx(v), Y = a.fy(schulzPdf(v, h.v_um_s, h.spread)); if (i === 1) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke(); }
    a.done();
    const st = seenTruth();
    $("pv-legend").innerHTML = '<span><i style="background:' + C["accent-2"] + '"></i>True speeds of the simulated swimmers</span><span><i style="background:' + C.ink + '"></i>Model fitted to all q (Schulz distribution)</span><span><i style="background:' + C.accent + '; opacity:0.5"></i>From the data, no shape assumed</span>' +
      (pv ? '<span>Cells that do not swim: ' + Math.round(100 * pv.data_still_share) + ' % from the data, ' + Math.round(100 * (h ? 1 - h.alpha : NaN)) + ' % from the model, ' + Math.round(100 * (1 - st.share)) + ' % true (as seen)</span>' : '');
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
    if (res.noise_B > 0) { const nb = res.q_per_um.map(function () { return res.noise_B; }); nb[0] = NaN; line(nb, C.muted, [5, 4]); }
    else line(res.B_est, C.muted, [5, 4]);
    res.fits.forEach(function (f) {
      if (!f.ok) return;
      const X = a.fx(f.q_per_um), used = f.reason === null;
      if (f.A > 0) { const v = f.A, out = v > y1 || v < y0; dot(ctx, X, a.fy(clampY(v)), used ? 3 : 2.4, used && !out ? C.accent : null, C.accent); }
      if (f.B > 0) { dot(ctx, X, a.fy(clampY(f.B)), used ? 2.6 : 2, used ? C.muted : null, C.muted); }
    });
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; const xq = a.fx(w.q_opt_per_um); ctx.beginPath(); ctx.moveTo(xq, a.m.t); ctx.lineTo(xq, a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]);
    a.done();
    $("amp-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>A: fit (dots), 2 var - B from the data (line)</span><span><i style="background:' + C.muted + '"></i>' + (res.noise_B > 0 ? 'B: camera noise from the mean count, 2 (counts + read noise\u00b2), the same at every q (dashed)' : 'B: fit (dots), zero-delay intercept (dashed)') + '</span><span>Hollow: point not used. Points beyond the axis are drawn at its edge.</span>';
  }

  // ---- result -------------------------------------------------------------------------------
  const MODE_SHORT = { brightfield: "bright-field", phase: "phase-contrast", darkfield: "dark-field", dic: "DIC", fluorescence: "widefield fluorescence", spinning: "spinning-disk confocal (X-Light V3)", scanning: "point-scanning confocal (AX R)" };
  // width of the image of a point (Rayleigh distance, 0.61 lambda / NA): the smallest spot the optics can make
  function spotWidth() { return 0.61 * centralWavelength() / Math.min(objective().na, nLiquid(centralWavelength())); }
  function pctTxt(x) { return x === null || x === undefined || !isFinite(x) ? "-" : (x < 0.0995 ? (100 * x).toFixed(1) : Math.round(100 * x)) + " %"; }
  function fmtV(v) { return v === null || v === undefined || !isFinite(v) ? "-" : fmtSig(v, 3) + " " + MU + "m/s"; }
  // the fit result when swimming was found (null when the cells that do not swim explain the data as well)
  function swimHead(res) { return res.head && !res.head.no_swim ? res.head : null; }
  function speedVerdict() {
    const res = cache.res, st = seenTruth(), tr = cache.movie.truth.swim, h = swimHead(res);
    if (!tr || tr.n_swimmers === 0) return h && h.alpha > 0.1 ? { cls: "bad", text: "Swimming found where there is none" } : { cls: "good", text: "No swimming, as it should be" };
    if (res.head && res.head.no_swim) return st.share < 0.15 ? { cls: "warn", text: "Too few swimmers to see", why: "Only about " + Math.round(100 * st.share) + " % of the signal comes from swimmers: the curves are explained as well by cells that only jiggle and turn." } : { cls: "bad", text: "Swimmers missed" };
    if (!h) {
      const counts = {}; res.fits.forEach(function (f) { if (f.reason) counts[f.reason] = (counts[f.reason] || 0) + 1; });
      const top = Object.keys(counts).sort(function (p, q) { return counts[q] - counts[p]; })[0];
      return { cls: "bad", text: "Not measurable", why: "Too few usable points. Most were left out because: " + top + "." };
    }
    const dev = h.v_um_s / st.v - 1, err = h.v_rel_err || 0;
    if (Math.abs(dev) <= Math.max(0.05, 2 * err)) return { cls: "good", text: Math.abs(dev) <= 0.05 ? "Speed matches (within 5 %)" : "Speed off by " + Math.round(100 * Math.abs(dev)) + " %, within the uncertainty", dev: dev };
    if (Math.abs(dev) <= 0.15) return { cls: "warn", text: "Speed off by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
    return { cls: "bad", text: "Speed wrong by " + Math.round(100 * Math.abs(dev)) + " %", dev: dev };
  }
  function shareVerdict() {
    const h = cache.res.head, st = seenTruth(); if (!h) return null;
    const d = Math.abs(h.alpha - st.share);
    // the true share "as seen" is itself uncertain by a few points (it weighs each cell by its signal), hence 0.08
    return d <= 0.08 ? { cls: "good", text: "Share of swimmers matches" } : d <= 0.15 ? { cls: "warn", text: "Share off by " + Math.round(100 * d) + " points" } : { cls: "bad", text: "Share wrong by " + Math.round(100 * d) + " points" };
  }
  function qualityChecks() {
    const res = cache.res, out = [], c = res.compressed, h = res.head;
    if (res.fast && res.fast.dev_from_model !== null) {
      const dv = res.fast.dev_from_model;
      out.push({ cls: dv < 0.1 ? "good" : dv < 0.25 ? "warn" : "bad", title: "Swimmers' rates follow the model", text: "At each q the rate of the swimmers' step (dots in the rate chart) differs from what the fitted model predicts by " + Math.round(100 * dv) + " % on average. On logarithmic axes the rates rise with slope " + res.fast.slope.toFixed(2) + ": 1 for point-like cells swimming straight, less for long cells at large q, more where cells leave the focal plane." });
    } else if (c) {
      const e = c.slope, d = Math.abs(e - 1);
      // a note, not a test: one rate per q (compressed exponential) follows the slow step of a two-step curve at some q
      // and the fast one at others, so its slope is not a clean test of the model (the speed at every q is)
      out.push({ cls: d < 0.15 && state.swim_frac > 0 ? "good" : "info", title: "Rates grow as q (swimming)", text: "On logarithmic axes the rates rise with slope " + e.toFixed(2) + " (1 for straight swimming, 2 for diffusion)." + (d < 0.15 ? "" : e > 1 ? " Between 1 and 2: a mixture of swimmers and cells that only diffuse, tumbles at small q, or cells leaving the focal plane." : " Below 1: one rate per q cannot follow curves that rise in two steps (it picks the slow step at some q and the fast one at others), and the finest patterns may change faster than the frames follow; the speed at every q, below, is the test of the model.") });
    }
    // few cells in view: the jackknife repeats the fits on parts of the same movie, so it cannot see which cells happen
    // to be in view (simulated Chlamydomonas, about 170 cells: scatter 3 times the quoted error; standard sample, 340
    // cells: 1.3 times)
    const nCells = cache.movie.info.n_particles;
    if (h && !h.no_swim && h.err_from === "jackknife" && nCells < 200) out.push({ cls: "info", title: "Few cells in view", text: "This movie shows only about " + nCells + " cells. The " + String.fromCharCode(177) + " comes from parts of the same movie, so it does not include which cells happen to be in view and how far from focus each one is: from one movie to the next the speed can scatter several times more. Use \"Repeat 5 times with new cells\", or film more cells (a larger field or a higher concentration)." });
    if (h && h.perq && h.perq.length >= 4) {
      const v = h.perq.map(function (e) { return e.v_um_s; }), m = v.reduce(function (a, b) { return a + b; }, 0) / v.length, sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (v.length - 1)), lo = v.slice(0, Math.max(1, Math.floor(v.length / 3))), hi = v.slice(-Math.max(1, Math.floor(v.length / 3)));
      const ml = lo.reduce(function (a, b) { return a + b; }, 0) / lo.length, mh = hi.reduce(function (a, b) { return a + b; }, 0) / hi.length, tilt = Math.abs(ml / mh - 1);
      out.push({ cls: tilt < 0.08 ? "good" : tilt < 0.2 ? "warn" : "bad", title: "Same speed at every q", text: "Speed from the smallest third of the q: " + fmtV(ml) + "; from the largest third: " + fmtV(mh) + "." + (tilt < 0.08 ? "" : ml > mh ? " Slower at large q: long cells at patterns finer than the cell, where the model's picture of the cell (a solid rod seen from above) no longer holds, as for thick cells in bright field at low aperture; or, at small q, cells moving up and down through the focus, which renews the wide patterns faster (try the model with the depth of field), or drift." : " Slower at small q: tumbles bend the runs, so over long distances the cells get less far than on straight runs.") });
    }
    if (h && res.used.length) {
      // the share of swimmers shows only where the cells that do not swim wander off during the movie
      const qm = res.used[res.used.length - 1].q_per_um, tm = res.taus_s[res.taus_s.length - 1], x = h.D_um2_s * qm * qm * tm;
      if (x < 1) out.push({ cls: "warn", title: "Share of swimmers", text: "The cells that do not swim barely move during this movie, even at the finest patterns used (D q\u00b2 \u0394t = " + x.toFixed(2) + " at the longest delay), so the curves cannot tell them apart from a larger or smaller share of swimmers. A longer movie or finer patterns help." });
    }
    if (res.pv && h) {
      const d = Math.abs(res.pv.data_still_share - (1 - h.alpha));
      out.push({ cls: d < 0.07 ? "good" : "warn", title: "Model and shape-free distribution agree", text: "Share that does not swim: " + Math.round(100 * (1 - h.alpha)) + " % from the model, " + Math.round(100 * res.pv.data_still_share) + " % from the distribution found without a shape; mean speed " + fmtV(h.v_um_s) + " and " + fmtV(res.pv.data_mean_swimmers_um_s) + "." });
    }
    return out;
  }
  function repeatStats(v) { const n = v.length, m = v.reduce(function (a, b) { return a + b; }, 0) / n, sd = Math.sqrt(v.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / Math.max(1, n - 1)); return { mean: m, sd: sd, rsd: sd / m }; }
  function renderResult() {
    const res = cache.res, mv = cache.movie, tr = mv.truth, swt = tr.swim, h = res.head, v = speedVerdict(), sv = shareVerdict(), st = seenTruth();
    let html = '<div class="eyebrow">Result</div>';
    html += h && h.no_swim ? '<div class="big">No swimming found</div>' : h ? '<div class="big">' + fmtV(h.v_um_s) + (h.v_rel_err ? ' <small>&plusmn; ' + Math.max(1, Math.round(100 * h.v_rel_err)) + ' %</small>' : '') + '</div>' : '<div class="big">No result</div>';
    html += '<span class="chip ' + v.cls + '">' + v.text + '</span>' + (sv ? ' <span class="chip ' + sv.cls + '">' + sv.text + '</span>' : '');
    if (v.why) html += '<p class="small" style="margin:0">' + v.why + '</p>';
    if (h && h.no_swim) html += '<p class="small" style="margin:0">The curves are described as well by cells that only jiggle (and, for rods, turn) as by any share of swimmers.</p>';
    else if (h) html += '<p class="small" style="margin:0">Mean swimming speed and share of cells that swim (' + Math.round(100 * h.alpha) + (h.alpha_err ? ' &plusmn; ' + Math.max(1, Math.round(100 * h.alpha_err)) : '') + ' %, true ' + Math.round(100 * st.share) + ' % as seen), from the model of ' + MODEL_LABEL[swimModel()] + ' fitted to all q at once. True mean speed ' + fmtV(swt.v_mean_um_s) + (Math.abs(st.v / swt.v_mean_um_s - 1) > 0.02 ? ', ' + fmtV(st.v) + ' as weighted by the signal' : '') + '.</p>';
    if (h && !h.no_swim && h.err_from === "jackknife" && level !== "curious") html += '<p class="small" style="margin:0">&plusmn;: how much the result changes with the part of the movie it comes from (the fits repeated ' + h.jackknife.blocks + ' times, each time with one ' + ["", "", "half", "third", "quarter", "fifth", "sixth"][h.jackknife.blocks] + ' of the movie left out). Errors of the model itself are not included: compare with the true values, or repeat with new cells.</p>';
    if (h && h.stroke_um) html += '<p class="small" style="margin:0">Stroke of each swimmer: ' + fmtSig(h.stroke_um, 2) + (h.stroke_um_err ? ' &plusmn; ' + fmtSig(h.stroke_um_err, 1) : '') + ' ' + MU + 'm at ' + fmtSig(h.stroke_hz, 3) + (h.stroke_hz_err ? ' &plusmn; ' + fmtSig(h.stroke_hz_err, 1) : '') + ' Hz (true ' + fmtSig(swt.osc_amp_um || 0, 2) + ' ' + MU + 'm at ' + fmtSig(swt.osc_hz || 0, 3) + ' Hz' + (swt.osc_amp_um > 0 && swt.osc_dir === "across" && swimModel() === "stroke" ? '; the cells stroke sideways, the model assumes along' : '') + ').</p>';
    if (level !== "curious" && h) {
      const pm = function (main, e, scale, dig) { return main === "main" && e ? ' <small>&plusmn; ' + (dig ? fmtSig(e * scale, dig) : Math.max(1, Math.round(e * scale))) + '</small>' : ''; };
      const row = function (cls, name, vv, share, spread, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + (pm(cls, h.v_rel_err && vv ? h.v_rel_err * vv : null, 1, 1) ? fmtSig(vv, 3) + pm(cls, h.v_rel_err * vv, 1, 1) + ' ' + MU + 'm/s' : fmtV(vv)) + '</td><td>' + (share === null || share === undefined ? "-" : Math.round(100 * share) + pm(cls, h.alpha_err, 100) + " %") + '</td><td>' + (spread === null || spread === undefined ? "-" : Math.round(100 * spread) + pm(cls, h.spread_err, 100) + " %") + '</td></tr>'; };
      let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">Mean speed</th><th scope="col">Swimming</th><th scope="col">Spread</th></tr></thead><tbody>';
      const isMain = function (m) { return swimModel() === m ? "main" : ""; };
      if (res.swim) t += row(isMain(res.kind === "2d" ? "plane" : "wilson"), res.kind === "2d" ? "Swimmers in the image plane" : "3D swimmers (Wilson et al. 2011)", res.swim.v_um_s, res.swim.alpha, res.swim.spread, isMain(res.kind === "2d" ? "plane" : "wilson") ? "the headline" : "");
      if (res.swim_depth) t += row("main", "3D swimmers, with the depth of field", res.swim_depth.v_um_s, res.swim_depth.alpha, res.swim_depth.spread, "the headline");
      if (res.swim_stroke) t += row("main", MODEL_LABEL[swimModel() === "strokex" ? "strokex" : "stroke"], res.swim_stroke.v_um_s, res.swim_stroke.alpha, res.swim_stroke.spread, "the headline; stroke " + fmtSig(res.swim_stroke.stroke_um, 2) + " " + MU + "m at " + fmtSig(res.swim_stroke.stroke_hz, 3) + " Hz");
      if (level === "addict" && res.published) t += row("pub", "Published model only (Wilson et al. 2011)", res.published.v_um_s, res.published.alpha, res.published.spread, "the same movie, without what this page adds" + (res.published.no_swim ? "; reads no swimming" : "") + (res.published.n_used ? ", " + res.published.n_used + " q" : ""));
      if (res.pv) t += row("", "Distribution from the data, no shape assumed", res.pv.data_mean_swimmers_um_s, 1 - res.pv.data_still_share, null, "see the chart below");
      if (res.fast) t += row("", "v\u2080 from the swimmers' step, rate = v\u2080 q", res.fast.v0_um_s, null, null, "a speed scale, not the mean speed: in 3D about mean / 2.2 for short cells");
      else if (res.compressed) t += row("", "v\u2080 from rate = v\u2080 q (compressed exponential)", res.compressed.v0_um_s, null, null, "a speed scale, not the mean speed: in 3D about mean / 2.2");
      t += row("truth", "True (simulation)", st.v, st.share, st.spread, "weighted by the signal");
      t += '</tbody></table></div>';
      html += t;
      const ch = qualityChecks();
      if (ch.length) html += '<div class="checks"><div class="eyebrow">Checks</div><ul>' + ch.map(function (c) { return '<li><span class="chip ' + c.cls + '">' + ({ good: "Pass", warn: "Check", bad: "Fail", info: "Note" })[c.cls] + '</span><div><b>' + c.title + '.</b> ' + c.text + '</div></li>'; }).join("") + '</ul></div>';
      html += '<div class="btns"><button type="button" id="btn-repeat"' + (repeat && !repeat.done ? ' disabled' : '') + '>' + (repeat && !repeat.done ? 'Repeating... ' + repeat.runs.length + ' of 5' : repeat && repeat.done ? 'Repeat 5 times again' : 'Repeat 5 times with new cells') + '</button><span class="small">' + (lastRunS ? 'about ' + Math.max(5, Math.round(5 * lastRunS)) + ' s' : '') + '</span></div>';
      if (repeat && repeat.runs.length) html += renderRepeatTable();
      html += '<details class="more"><summary>Details</summary><dl>';
      html += '<dt>Diffusion of cells that do not swim</dt><dd>' + fmtSig(h.D_um2_s, 3) + (h.D_err && !h.D_fixed ? ' &plusmn; ' + fmtSig(h.D_err, 2) : '') + ' ' + MU + 'm<sup>2</sup>/s ' + (h.D_fixed ? '(set from the size of the cells and the viscosity: the data agree with it)' : '(fitted; true ' + fmtSig(tr.D_um2_s, 3) + ')') + '</dd>';
      if (h.no_swim && TURNS()) html += '<dt>Turning of the cells</dt><dd>rate 6 D<sub>R</sub> = ' + fmtSig(6 * h.D_r_s, 2) + ' s\u207b\u00b9 (true ' + (cache.movie.truth.rot_rate_s ? fmtSig(cache.movie.truth.rot_rate_s, 2) : '-') + '), seen in ' + Math.round(100 * (h.turn_share || 0)) + ' % of each pattern on average. The turning of rods is only roughly described by one rate, so both numbers come out approximate.</dd>';
      if (!h.no_swim && h.turn_perq && h.tumble_hz > 0.0011) html += '<dt>Tumbles</dt><dd>' + fmtSig(h.tumble_hz, 2) + ' per second (true ' + fmtSig(swt.tumble_hz || 0, 2) + '): from the fading of the swimmers\' images, as each tumble gives a new heading</dd>';
      if (!h.no_swim && h.turn_perq && h.swim_dr_s > 0.0011) html += '<dt>Turning of the swimmers</dt><dd>D<sub>s</sub> = ' + fmtSig(h.swim_dr_s, 2) + ' rad<sup>2</sup>/s (true ' + (swt.rot_diff_s ? fmtSig(swt.rot_diff_s, 2) : '-') + '): their images fade as they turn, like those of the cells that do not swim, at rate 6 D<sub>s</sub></dd>';
      html += '<dt>Liquid</dt><dd>' + LIQUIDS[state.liquid] + (state.liquid === "glycerol" ? " " + Math.round(100 * state.glycerol_w) + " %" : "") + ', ' + state.T_C.toFixed(0) + ' &deg;C, ' + (mv.viscosity_Pa_s * 1000).toFixed(2) + ' mPa s</dd>';
      html += '<dt>Wave vectors used</dt><dd>' + res.used.length + (res.used.length ? ', ' + res.used[0].q_per_um.toFixed(2) + ' to ' + res.used[res.used.length - 1].q_per_um.toFixed(2) + ' ' + MU + 'm\u207b\u00b9' : '') + '</dd>';
      if (res.compressed) html += '<dt>Compressed exponential</dt><dd>exponent &beta; ' + res.compressed.beta_free_mean.toFixed(2) + ' (mean over q), v<sub>0</sub> ' + fmtV(res.compressed.v0_um_s) + ', slope ' + res.compressed.slope.toFixed(2) + '</dd>';
      html += '<dt>Simulated cells</dt><dd>' + mv.info.n_particles + ', of which ' + swt.n_swimmers + ' swim' + (swt.n_plane ? ', all along the glass' : '') + '</dd>';
      html += '</dl></details>';
    }
    $("result").innerHTML = html;
    const br = $("btn-repeat"); if (br) br.addEventListener("click", startRepeat);
    $("hero-result").innerHTML = '<span>True mean speed</span><span class="n">' + fmtV(swt.v_mean_um_s) + '</span><span>Measured by DDM</span><span class="n">' + (h ? fmtV(h.v_um_s) : "-") + '</span>' +
      '<span>Cells that swim: ' + Math.round(100 * swt.fraction) + ' % true' + (swt.n_swimmers > 0 && Math.abs(st.share - swt.fraction) >= 0.025 ? ' (' + Math.round(100 * st.share) + ' % of what the microscope sees)' : '') + ', ' + (h ? Math.round(100 * (h.no_swim ? 0 : h.alpha)) + ' %' : '-') + ' measured</span><span class="chip ' + v.cls + '">' + v.text + '</span>' + (sv && sv.cls !== "good" && swt.n_swimmers > 0 ? ' <span class="chip ' + sv.cls + '">' + sv.text + '</span>' : '');
    $("hero-cap").textContent = "Simulated " + MODE_SHORT[state.mode] + " movie" + (cache.cfg.polarization ? " between polarizers" : "") + ", " + objective().m + "x / NA " + objective().na + ", field " + fmtSig(mv.L_um, 2) + " " + MU + "m.";
  }
  function renderRepeatTable() {
    const rows = repeat.runs;
    let t = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Movie</th><th scope="col">Mean speed</th><th scope="col">Swimming</th><th scope="col">True (as seen)</th></tr></thead><tbody>';
    rows.forEach(function (r, k) { t += '<tr><th scope="row">' + (k + 1) + '</th><td>' + fmtV(r.v) + '</td><td>' + Math.round(100 * r.alpha) + ' %</td><td>' + (r.seen ? fmtV(r.seen.v_mean_um_s) + ', ' + Math.round(100 * r.seen.fraction) + ' %' : '-') + '</td></tr>'; });
    if (rows.length >= 2) {
      const a = repeatStats(rows.map(function (r) { return r.v; })), b = repeatStats(rows.map(function (r) { return r.alpha; }));
      t += '<tr class="main"><th scope="row">Mean</th><td>' + fmtV(a.mean) + '</td><td>' + Math.round(100 * b.mean) + ' %</td><td></td></tr>';
      t += '<tr><th scope="row">Spread</th><td>' + pctTxt(a.rsd) + '</td><td>&plusmn; ' + Math.round(100 * b.sd) + ' points</td><td></td></tr>';
    }
    return t + '</tbody></table></div>';
  }
  function visibilityText(cfg, m) {
    const w = spotWidth(), d = cfg.diameter_um;
    if (d >= w) return "The cells are larger than the smallest detail the microscope resolves, so you can see their shape; DDM still never needs to find or follow them.";
    return "Each cell is smaller than the smallest detail the microscope resolves (about " + fmtSig(w, 2) + " " + MU + "m here), so it shows as a blurred spot of about that width.";
  }
  function renderText() {
    const m = cache.movie, cfg = cache.cfg, sw = m.truth.swim;
    const modeTxt = { brightfield: "a bright-field microscope", phase: "a phase-contrast microscope", darkfield: "a dark-field microscope", dic: "a DIC microscope", fluorescence: "a widefield fluorescence microscope", spinning: "a spinning-disk confocal microscope", scanning: "a point-scanning confocal microscope" }[state.mode];
    $("movie-text").textContent = "The movie shows " + (state.shape === "rod" ? fmtSize(cfg.diameter_um) + " long rod-shaped cells" : fmtSize(cfg.diameter_um) + " round cells") + ", filmed through " + modeTxt + " " + (m.times_s ? "at log-spaced times, in cycles that start at " + fmtNum(cfg.frame_rate_hz) + " frames a second and slow down (" + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) + " in all). " : fmtNum(cfg.frame_rate_hz) + " times a second. ") +
      (state.swim_frac === 0 ? "None of them swim: they only jiggle" + (state.shape === "rod" ? " and turn" : "") + ". " :
       (state.swim_frac >= 1 ? "All of them swim" : Math.round(100 * state.swim_frac) + " % of them swim") + ", on average at " + fmtV(state.swim_v) + (state.swim_geom === "glass" ? ", along the bottom glass" : ", in all directions") + (state.swim_tumble > 0 ? ", tumbling about " + fmtSig(state.swim_tumble, 2) + " times a second" : "") + (state.swim_frac >= 1 ? ". " : "; the others only jiggle. ")) +
      (state.swim_osc_amp > 0 ? "Each swimmer also moves back and forth by " + fmtSig(state.swim_osc_amp, 2) + " " + MU + "m, " + fmtSig(state.swim_osc_hz, 3) + " times a second (" + (state.swim_osc_dir === "across" ? "sideways, like a sperm head" : "along its path, like an alga's breaststroke") + "). " : "") + visibilityText(cfg, m) +
      (state.swim_geom === "glass" ? "" : " Cells above and below the focal plane add wider, fainter blurs, and swimmers move in and out of focus.");
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + (m.times_s ? m.T + " frames at log-spaced times, shortest interval 1/" + fmtNum(m.frame_rate_hz) + " s: " + fmtDur(m.times_s[m.T - 1] + 1 / m.frame_rate_hz) + " in all (evenly spaced, the same frames would last " + fmtDur(m.T / m.frame_rate_hz) + ")." : m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s = " + fmtSig(m.T / m.frame_rate_hz, 3) + " s.") + " Cell " + cfg.cell_um + " " + MU + "m thick, focus " + fmtSig(cfg.focus_um, 2) + " " + MU + "m above the bottom, " + m.info.n_particles + " cells, " + sw.n_swimmers + " swimming.";
    $("diff-note").textContent = "A cell that moved leaves a pair of shapes, one darker and one brighter, at its old and its new place. Swimmers leave pairs that are far apart, cells that only jiggle leave close pairs.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const r = cache.res, i = cache.movie.info, h = r.head;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: state.mode, detector: SCANNING() ? "Nikon AX R, " + SCANNERS[state.scanner].label : cam().label + ", " + cam().modes[state.cam_mode].label, simulation: cache.cfg, analysis: cache.opts,
      optics: { cells: i.n_particles, kernel_rank: i.rank, kernel_residual: +i.rank_residual.toExponential(1) },
      result: h ? { model: h.no_swim ? "no swimming found" : swimModel(), v_um_s: h.no_swim ? null : +h.v_um_s.toPrecision(4), share_swimming: +h.alpha.toFixed(3), spread: +h.spread.toFixed(3), D_um2_s: +h.D_um2_s.toPrecision(3), q_used: r.used.length } : null,
      compressed: r.compressed ? { v0_um_s: +r.compressed.v0_um_s.toPrecision(4), slope: +r.compressed.slope.toFixed(3), beta_mean: +r.compressed.beta_free_mean.toFixed(3) } : null };
    $("settings-json").textContent = JSON.stringify(obj, function (k, v) { return k === "v_list" ? undefined : v; }, 1);
  }
  function renderReport() {
    const el = $("iso-report"); if (!el) return;
    const r = cache.res, mv = cache.movie, cfg = cache.cfg, tr = mv.truth, h = r.head, L = [];
    L.push("MOTILITY REPORT (simulated measurement)");
    L.push("Generated by the DDM swimmers page on " + new Date().toISOString().slice(0, 10) + ". Simulated data: not a real measurement.");
    L.push("");
    L.push("Results");
    if (h && h.no_swim) L.push("  No swimming found: the curves are described as well by cells that only diffuse" + (state.shape === "rod" ? " and turn" : "") + " (diffusion " + fmtSig(h.D_um2_s, 3) + " um^2/s).");
    else if (h) {
      L.push("  Mean swimming speed: " + fmtSig(h.v_um_s, 3) + " um/s" + (h.v_rel_err ? " (+- " + (100 * h.v_rel_err).toFixed(1) + " %)" : "") + "; relative spread of speeds " + Math.round(100 * h.spread) + " %" + (h.spread_err ? " (+- " + Math.max(1, Math.round(100 * h.spread_err)) + " points)" : ""));
      L.push("  Share of cells that swim: " + Math.round(100 * h.alpha) + " %" + (h.alpha_err ? " (+- " + Math.max(1, Math.round(100 * h.alpha_err)) + " points)" : "") + "; diffusion of the others " + fmtSig(h.D_um2_s, 3) + " um^2/s" + (h.D_fixed ? " (set from the size of the cells)" : h.D_err ? " (+- " + fmtSig(h.D_err, 2) + ")" : ""));
      if (h.err_from === "jackknife") L.push("  Uncertainties (+-): jackknife over " + h.jackknife.blocks + " blocks of the movie (the fits repeated with one block left out); they do not include errors of the model");
      if (h.stroke_um) L.push("  Stroke: " + fmtSig(h.stroke_um, 2) + " um at " + fmtSig(h.stroke_hz, 3) + " Hz");
      L.push("  Model: " + MODEL_LABEL[swimModel()] + ", fitted to " + r.used.length + " wave vectors at once (" + r.used[0].q_per_um.toFixed(2) + " to " + r.used[r.used.length - 1].q_per_um.toFixed(2) + " um^-1)");
      if (r.pv) L.push("  Distribution without an assumed shape: mean " + fmtSig(r.pv.data_mean_swimmers_um_s, 3) + " um/s, " + Math.round(100 * (1 - r.pv.data_still_share)) + " % swimming");
      if (r.compressed) L.push("  Compressed exponential: v0 = " + fmtSig(r.compressed.v0_um_s, 3) + " um/s from Gamma = v0 q (not the mean speed), mean exponent " + r.compressed.beta_free_mean.toFixed(2));
    } else L.push("  No result: too few usable wave vectors.");
    L.push("");
    L.push("Organism: " + ORGANISMS[state.organism].label + (state.organism === "model" || state.organism === "custom" ? "" : " (settings after the cited paper; see the page)"));
    L.push("Sample (simulated): " + (state.shape === "rod" ? "rods " + fmtSize(cfg.diameter_um) + " long, aspect ratio " + fmtSig(cfg.aspect, 2) : "spheres " + fmtSize(cfg.diameter_um)) + "; " + mv.info.n_particles + " cells, " + tr.swim.n_swimmers + " swimming" + (state.swim_geom === "glass" ? " along the glass" : " in 3D") + (state.swim_tumble > 0 ? ", " + fmtSig(state.swim_tumble, 2) + " tumbles per second" : ", straight runs") + "; " + LIQUIDS[state.liquid] + ", " + state.T_C.toFixed(0) + " C, cell " + cfg.cell_um + " um, focus " + fmtSig(cfg.focus_um, 2) + " um above the bottom");
    L.push("Microscope (simulated): Nikon Ti2-E, " + objective().n + ", " + ($("c-mode").selectedOptions[0].textContent) + "; " + mv.n + " x " + mv.n + " pixels of " + fmtSig(mv.pixel_um, 3) + " um, " + mv.T + " frames at " + fmtNum(mv.frame_rate_hz) + " frames/s" + (mv.times_s ? ", taken at log-spaced times in repeating cycles (" + fmtDur(mv.times_s[mv.T - 1] + 1 / mv.frame_rate_hz) + " in all); structure function from pairs of frames grouped by their delay, up to " + mv.T + " pairs per delay" : ""));
    L.push("True values: mean speed " + fmtSig(tr.swim.v_mean_um_s, 3) + " um/s (relative spread " + Math.round(100 * tr.swim.v_sd_um_s / Math.max(1e-9, tr.swim.v_mean_um_s)) + " %), " + Math.round(100 * tr.swim.fraction) + " % swimming; as seen by the microscope over the q used: " + fmtSig(seenTruth().v, 3) + " um/s, " + Math.round(100 * seenTruth().share) + " %.");
    el.textContent = L.join("\n");
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; $("lag-out").textContent = fmtDur(res.taus_s[li]) + (res.pairs ? " (" + res.lags[li] + (res.lags[li] === 1 ? " frame interval, " : " frame intervals, ") + res.pairs[li].length / 2 + " pairs of frames)" : " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)")); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawFov(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCurves(); drawRates(); drawCollapse(); renderMotion(); drawSize(); drawPv(); drawAmp(); renderResult(); renderSettings(); renderReport();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const SPIN20 = function (model) { return { mode: "spinning", camera: "kinetix", cam_mode: "dynamic", iface: "pcie", objective: objIndexByName("CFI Plan Apochromat Lambda D 20X"), binning: 2, frame_rate_hz: 100, exposure_ms: 2, shape: "sphere", diameter_um: 1, phi: 4e-4, swim_model: model }; };
  const SPIN60 = function (model) { return { mode: "spinning", camera: "kinetix", cam_mode: "dynamic", iface: "pcie", objective: objIndexByName("CFI Plan Apochromat IR 60XC WI"), binning: 4, frame_rate_hz: 100, exposure_ms: 2, shape: "sphere", diameter_um: 1, phi: 1.6e-3, swim_model: model }; };   // denser than at 20x: the thin slice holds few cells
  const CARDS = [
    { lvl: 1, title: "How many swim", text: "Each curve falls in two steps: a fast one from the swimmers and a slow one from the cells that only jiggle. The height of the fast step gives the share of swimmers, the speed of the slow step how fast the others diffuse. A motility assay reads both from one movie of thousands of cells.",
      shows: [{ label: "None swims", set: { swim_frac: 0 }, go: "step-curves" }, { label: "A third swims", set: { swim_frac: 0.3 }, go: "step-curves" }, { label: "All swim", set: { swim_frac: 1 }, go: "step-curves" }] },
    { lvl: 1, title: "A camera that is too slow", text: "A swimmer at 20 " + MU + "m/s crosses a fine stripe pattern in a few hundredths of a second. If the pattern has renewed between two frames, its rate cannot be read, and only the widest patterns are left. Bacteria at 20 " + MU + "m/s need about 50 frames per second or more.",
      shows: [{ label: "10 frames/s", set: { frame_rate_hz: 10, exposure_ms: 1 }, go: "step-rates" }] },
    { lvl: 1, title: "Drift looks like swimming", text: "A slow flow carries every cell the same way. Averaged over all directions, a drift gives curves very much like those of cells swimming in the plane, so a careless analysis reports swimmers that are not there. Check the movie, or measure the drift on its own: it makes the map in step 4 lopsided.",
      shows: [{ label: "No swimmers, drift 10 " + MU + "m/s", set: { swim_frac: 0, drift_um_s: 10 }, go: "step-rates" }] },
    { lvl: 2, title: "Swimming along the glass", text: "Near a surface many bacteria swim parallel to it. Then each pattern renews faster for the same speed (in 3D most cells swim at an angle to the stripes), and the model must be the one for the plane: analysed as 3D swimmers, the speed comes out about 30 % too high.",
      shows: [{ label: "Along the glass, plane model", set: { swim_geom: "glass", swim_model: "auto" }, go: "step-rates" }, { label: "The same, 3D model", set: { swim_geom: "glass", swim_model: "wilson" }, go: "step-rates" }] },
    { lvl: 2, title: "Confocal: swimmers leave the slice", text: "A confocal microscope sees a slice one or a few micrometres thick. A swimmer crosses it in a fraction of a second, and a pattern fades as soon as its cells leave the slice, before they have swum across it. Wilson's 3D model knows only sideways motion, so the speed comes out too high. In our simulations of round cells 1 " + MU + "m across with a spinning disk (three movies each): 12-17 % too fast at 20x, and more than twice the true speed at 60x (water immersion). The model that also uses how each pattern fades as a cell moves up or down through the focus, computed from the optics of the microscope, brings the speed within 4 % at 20x. At 60x the slice is about as thin as a cell: the speed comes within about 3 %, but the share of swimmers reads about 15 points too high. The model treats each cell as a point, and rods longer than the slice come out too slow with it. Widefield fluorescence shows the same effect, weaker (up to about 10 % at 20x and 25 % at 60x). As far as we know, this has not been published.",
      shows: [{ label: "Spinning disk 20x, Wilson's model", set: SPIN20("wilson"), go: "step-rates" }, { label: "Spinning disk 20x, with the depth of field", set: SPIN20("depth"), go: "step-rates" }, { label: "Spinning disk 60x water, Wilson's model", set: SPIN60("wilson"), go: "step-rates", lvl: 2 }, { label: "Spinning disk 60x water, with the depth of field", set: SPIN60("depth"), go: "step-rates", lvl: 2 }] },
    { lvl: 2, title: "Tumbles", text: "E. coli runs for about a second, then tumbles and swims off in a new direction. Over distances longer than a run the cells get less far than on a straight line, so the widest patterns renew more slowly and the speed from them comes out low. The models here assume straight runs; use the finer patterns, or a model with tumbles (Kurzthaler et al. 2024).",
      shows: [{ label: "One tumble per second", set: { swim_tumble: 1 }, go: "step-rates" }, { label: "Three per second", set: { swim_tumble: 3 }, go: "step-rates" }] },
    { lvl: 2, title: "Algae and sperm: the stroke", text: "Chlamydomonas pulls itself forward with a breaststroke of its two flagella, about 50 times a second, and slips back a little each time. Its curves dip and rise again once per beat. Wilson's model, made for gliding bacteria, ignores the stroke: its speed comes out a few % low, as Martinez et al. (2012) also found, and it says nothing about the beat. Their model with the stroke gets the speed, the size of the stroke and the beat. The camera must take at least two frames per beat.",
      shows: [{ label: "Chlamydomonas, model with the stroke", set: Object.assign({ organism: "chlamy" }, ORGANISMS.chlamy.set), go: "step-curves" }, { label: "The same, Wilson's model", set: Object.assign({ organism: "chlamy", swim_model: "wilson" }, ORGANISMS.chlamy.set), go: "step-rates" }, { label: "Bull sperm (head moving sideways)", set: Object.assign({ organism: "sperm" }, ORGANISMS.sperm.set), go: "step-rates", lvl: 2 }] },
    { lvl: 2, title: "Long cells", text: "A long rod that swims along its own axis looks the same after a short step, except near its ends. Stripes across its axis barely show in its image when they are finer than its length, so the cells that swim along a stripe pattern's wave vector, the ones that renew it fastest, count less. Wilson's model treats cells as points and then reads the speed low: for 5 " + MU + "m rods by about 20 %, for 50 " + MU + "m Euglena in fluorescence by 40 %. The page weighs each swimmer by how strongly its image shows the pattern for its direction of travel (from the length and width of the cells, which the experimenter measures in the images; see the methods). It keeps, by default, to patterns at least as wide as a cell is long (q below 2 pi / length): finer ones also depend on how a thick cell looks in bright field. The share of swimmers is less reliable for long rods: the still rods also fade as they turn.",
      shows: [{ label: "Rods 5 " + MU + "m long, all q", set: { diameter_um: 5, aspect: 6, phi: 1.5e-3, q_max: 5 }, go: "step-rates" }, { label: "The same, automatic range (up to 2 pi / length)", set: { diameter_um: 5, aspect: 6, phi: 1.5e-3 }, go: "step-rates" }] },
    { lvl: 2, title: "Dark field and fluorescence", text: "The same assay in other contrasts. Dark field shows the cells bright on black with a low-NA objective and a phase annulus. Widefield fluorescence needs labelled cells and collects light from far out of focus, which adds some of the confocal problem.",
      shows: [{ label: "Dark field, Ph3 annulus, 10x", set: { mode: "darkfield", df_kind: "annulus", annulus: "Ph3", objective: objIndexByName("CFI Plan Fluor 10X") }, go: "step-setup" }, { label: "Widefield fluorescence, 20x", set: { mode: "fluorescence", objective: objIndexByName("CFI Plan Apochromat Lambda D 20X"), binning: 2, exposure_ms: 2 }, go: "step-setup" }] },
    { lvl: 2, title: "Fast and slow in one movie: log-spaced frames", text: "Swimmers renew a pattern in a fraction of a second; cells that only jiggle need a minute or more for the widest patterns. Evenly spaced frames cover both only with a very long movie. Taking the frames at log-spaced times, the first few at the full frame rate and then further and further apart, in a cycle that repeats, keeps the short delays and adds long ones with the same number of frames, as a multi-tau correlator does in light scattering. The slow step of the non-swimmers then shows in full (right-hand chart in step 6), and the diffusion of non-motile cells comes out right, where 5 s of evenly spaced frames read it 40 to 60 % too high. The price: fewer pairs of frames at the shortest delays, so those points scatter a little more.",
      shows: [{ label: "Log-spaced, 20 times longer", set: { frame_timing: "log", log_factor: 20 }, go: "step-curves" }, { label: "Non-motile E. coli (motA), evenly spaced", set: Object.assign({ organism: "ecoli_mota" }, ORGANISMS.ecoli_mota.set), go: "step-rates" }, { label: "The same, log-spaced", set: Object.assign({ organism: "ecoli_mota" }, ORGANISMS.ecoli_mota.set, { frame_timing: "log", log_factor: 20 }), go: "step-rates" }] },
    { lvl: 3, title: "Too few swimmers", text: "A high magnification shows a small field with few cells. The curves then scatter from one movie to the next, and the speed with them; repeat the movie, or use a lower magnification. Here a 60x objective sees a field of about 55 " + MU + "m with about a hundred cells.",
      shows: [{ label: "60x, phase contrast", set: { objective: objIndexByName("CFI Plan Apochromat Lambda D 60X Oil"), binning: 4 }, go: "step-rates" }] }
  ];
  function buildCards() {
    const host = $("cards");
    CARDS.forEach(function (c) {
      const el = document.createElement("article"); el.className = "card" + (c.lvl === 2 ? " lvl-2" : c.lvl === 3 ? " lvl-3" : "");
      const h = document.createElement("h3"); h.textContent = c.title; el.appendChild(h);
      const p = document.createElement("p"); p.textContent = c.text; el.appendChild(p);
      if (c.shows.length) {
        const b = document.createElement("div"); b.className = "btns";
        c.shows.forEach(function (sh) {
          const btn = document.createElement("button"); btn.type = "button"; btn.textContent = sh.label; if (sh.lvl === 2) btn.className = "lvl-2";
          btn.addEventListener("click", function () { applyPreset(sh.set); document.getElementById(sh.go).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
          b.appendChild(btn);
        });
        el.appendChild(b);
      }
      host.appendChild(el);
    });
  }
  function applyPreset(set) {
    const keep = state.seed, sp = state.sim_px;
    state = Object.assign({}, BASE, set);
    if (!set.organism && (set.shape !== undefined || set.diameter_um !== undefined || set.aspect !== undefined || set.particle !== undefined)) state.organism = "custom";
    state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    if (state.mode === "phase" && !objRing()) onChangeQuiet("mode");
    if (state.mode === "phase" && objRing()) state.annulus = objRing();
    if (state.swim_geom === "glass") state.focus_frac = Math.min(1, glassHeight() / state.cell_um);
    if (state.mode === "scanning" && !set.zoom) autoZoom();
    if (set.camera && !set.cam_mode) { const c = cam(); state.cam_mode = Object.keys(c.modes)[0]; state.iface = Object.keys(c.ifaces)[0]; }
    constrain(); syncControls(); drawFov(); schedule();
  }
  // the phase-objective swap of onChange, without scheduling a run
  function onChangeQuiet(key) {
    if (key === "mode" && state.mode === "phase" && !objRing()) {
      const o0 = objective(); let best = -1, bd = Infinity;
      OBJECTIVES.forEach(function (o, i) { if (!o.ph || o.m !== o0.m) return; const k = o.ph.replace(/^Ext\s*/i, "").replace(/^PH/i, "Ph"); if (!ANNULI[k]) return; const dd = Math.abs(o.na - o0.na); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) state.objective = best;
      if (objRing()) state.annulus = objRing();
    }
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
          if (kind === "faster") state.swim_v = Math.min(100, state.swim_v * 2);
          if (kind === "fewer") state.swim_frac = Math.round(20 * state.swim_frac / 2) / 20;
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
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawFov(); if (cache.res) { drawCurves(); drawRates(); drawCollapse(); drawSize(); drawPv(); drawAmp(); drawMapOverlay(); } }, 80); };
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
    organisms: function () { return Object.keys(ORGANISMS); }, organism: function (k) { state.organism = k; onChange("organism"); },
    stroke: function () { const h = cache && cache.res && cache.res.head; return h ? { A: h.stroke_um, f: h.stroke_hz } : null; },
    controls: function () { return CONTROLS.filter(function (c) { return c.kind !== "qrange" && (!c.when || c.when()); }).map(function (c) {
      const opts = c.kind === "objective" ? OBJECTIVES.map(function (o, i) { return i; }) : c.kind === "select" ? (typeof c.options === "function" ? c.options() : c.options).map(function (o) { return o[0]; }) : null;
      return { key: c.key, kind: c.kind, lvl: c.lvl, min: c.min, max: c.max, options: opts };
    }); },
    truth: function () { return cache && cache.movie ? cache.movie.truth : null; },
    config: function () { return { cfg: simConfig(), opts: analysisOptions() }; },
    timing: function () { const m = cache && cache.movie, r = cache && cache.res; return m ? { T: m.T, span_s: m.times_s ? m.times_s[m.T - 1] + 1 / m.frame_rate_hz : m.T / m.frame_rate_hz, uneven: !!m.times_s, delays: r ? r.taus_s.length : null, tau_max_s: r ? r.taus_s[r.taus_s.length - 1] : null } : null; },
    result: function () { const r = cache && cache.res; if (!r) return null; const h = r.head, st = seenTruth(); return { v: h ? h.v_um_s : null, alpha: h ? h.alpha : null, spread: h ? h.spread : null, D: h ? h.D_um2_s : null, model: swimModel(), v0: r.compressed ? r.compressed.v0_um_s : null, seen_v: st.v, seen_share: st.share, true_v: cache.movie.truth.swim.v_mean_um_s, used: r.used.length, reasons: r.fits.map(function (f) { return f.reason; }) }; }
  };
})();
