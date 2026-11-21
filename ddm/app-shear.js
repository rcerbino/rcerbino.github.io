(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const MU = "\u00b5", DEG = "\u00b0", SQ = "\u00b2", MINUS1 = "\u207b\u00b9";

  // ---- the instrument: Nikon ECLIPSE Ti2-E in bright field, with the shear cell on the stage ----------------
  const OBJECTIVES = JSON.parse(document.getElementById("objectives-data").textContent);
  const CONDENSERS = {
    elwd: { label: "ELWD, NA 0.3, WD 75 mm", na: 0.3 },
    lwd: { label: "LWD, NA 0.52, WD 30 mm", na: 0.52 },
    namc: { label: "NAMC, NA 0.4, WD 44 mm", na: 0.4 }
  };
  // Hamamatsu ORCA-Flash4.0 V3 (technical note SCAS0134E)
  const ORCA = { label: "Hamamatsu ORCA-Flash4.0 V3", px: 6.5, cols: 2048, rows: 2048, qe: 0.82, rn: 1.6, fw: 30000, t_row: 1 / (100 * 1024), rois: [2048, 1024, 512, 256, 128] };
  const FIELD_NUMBER_MM = 25;
  const GAP_UM = 500;                          // plate separation of the shear cell
  const KB = 1.380649e-23;
  function objIndexByName(name) { for (let i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].n === name) return i; throw new Error("objective not found: " + name); }

  // ---- the materials --------------------------------------------------------------------------------------
  // Microgel: rearrangements per cycle set to the two strains measured by Edera et al. (Soft Matter 17, 8553, 2021) on
  // Carbopol 0.5 wt% at 1 Hz with 2 um tracers: 20 % (D along the flow 2.2e-4, along the vorticity 2.6e-4 um^2/s) and
  // 80 % (0.29 and 0.19), with a smooth step at the yield strain of about 60 % (the G'/G'' crossing). In between and beyond:
  // our assumption. The same rearrangement per cycle at other frequencies (D proportional to f).
  const MATERIALS = {
    carbopol: { label: "A microgel, yield-stress fluid (Carbopol 0.5 %)", note: "A soft solid made of swollen polymer particles packed together, as in hair gel. It holds its shape below a yield strain of about 60 % and flows above it." },
    rubber: { label: "An elastic solid (crosslinked silicone rubber)", note: "A rubber such as Sylgard 184: it deforms with the plates and springs back exactly; nothing rearranges. Edera et al. used it to check that their shear cell adds no motion of its own." },
    liquid: { label: "A viscous liquid (glycerol and water)", note: "A simple liquid: slow flows of it are reversible, so the shear brings every bead back; only the beads' own Brownian motion is not undone." }
  };
  function step(g) { return 1 / (1 + Math.exp(-(g - 0.6) / 0.05)); }
  // diffusion coefficients of the rearrangements (flow x, vorticity y, gradient h) in um^2/s, and whether the beads also
  // diffuse thermally in the liquid
  function rearrangements(mat, g, f) {
    if (mat === "carbopol") { const r = Math.pow(g / 0.2, 2), a = Math.pow(g / 0.8, 2) * step(g), sc = f / 1; const Dx = (2.2e-4 * r + 0.29 * a) * sc, Dy = (2.6e-4 * r + 0.19 * a) * sc; return { D: [Dx, Dy, Dy], brownian: false }; }
    if (mat === "rubber") return { D: [0, 0, 0], brownian: false };
    return { D: [0, 0, 0], brownian: true };
  }
  function thermalD() { return KB * (state.T_C + 273.15) / (6 * Math.PI * viscosity_mPa_s() * 1e-3 * state.diameter_um / 2 * 1e-6) * 1e12; }
  function trueD(g) { const r = rearrangements(state.material, g === undefined ? state.strain : g, state.freq_hz), th = r.brownian ? thermalD() : 0; return [r.D[0] + th, r.D[1] + th]; }
  function viscosity_mPa_s() { return OPTICS.viscosityWaterGlycerol_mPa_s(state.material === "liquid" ? state.glycerol_w : 0, state.T_C); }
  const SWEEP = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.5];

  // the standard sample: the microgel at 20 % and 1 Hz, 2 um polystyrene beads, bright field through a 20x NA 0.45 ELWD
  // objective with the condenser at NA 0.52 (as in Edera et al. 2021), ORCA-Flash4.0, 4 frames per cycle, 512 frames
  const BASE = {
    material: "carbopol", strain: 0.2, freq_hz: 1, glycerol_w: 0.9, diameter_um: 2, phi: 0.01, T_C: 22, cell_um: 40,
    objective: objIndexByName("CFI S Plan Fluor ELWD 20XC"), condenser: "lwd", na_c: 0.52, source: "green", light_frac: 0.5,
    roi: 512, binning: 1, sim_px: 128, per_cycle: 4, n_frames: 512, exposure_ms: 2,
    q_min: null, q_max: null, seed: 1, x_phase: "on", x_noise: "on"
  };
  let state = Object.assign({}, BASE);
  const LEVEL_RANK = { curious: 1, student: 2, researcher: 3, addict: 4 };
  let level = "curious";
  function fmtNum(v) { return v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function fmtSig(v, d) { if (!Number.isFinite(v)) return "-"; if (v === 0) return "0"; return String(Number(v.toPrecision(d))); }
  function fmtTime(s) { return s < 1 ? fmtSig(s * 1000, 2) + " ms" : fmtSig(s, 2) + " s"; }
  function fmtDur(s) { return s < 120 ? fmtTime(s) : s < 7200 ? fmtSig(s / 60, 2) + " min" : fmtSig(s / 3600, 2) + " h"; }
  function fmtD(v) { return !Number.isFinite(v) ? "-" : v === 0 ? "0" : v < 0.01 ? v.toExponential(1).replace("e-", "e-") : fmtSig(v, 2); }
  function fmtPct(g) { return fmtSig(100 * g, 3) + " %"; }

  // ---- derived numbers ------------------------------------------------------------------------------------
  function objective() { return OBJECTIVES[state.objective]; }
  function pixelUm() { return ORCA.px * state.binning / objective().m; }
  function outPx() { return state.roi / state.binning; }
  const MAX_PARTICLES = 20000;
  function particlesFor(n) { const v = Math.PI / 6 * Math.pow(state.diameter_um, 3); return state.phi / v * Math.pow(n * pixelUm(), 2) * state.cell_um; }
  function simPx() { let n = Math.min(state.sim_px, outPx()); while (n > 32 && particlesFor(n) > MAX_PARTICLES) n /= 2; return n; }
  function maxFrames(n) { return Math.floor((1 << 23) / (n * n)); }
  function nFrames() { return Math.min(state.n_frames, maxFrames(simPx())); }
  function frameRate() { return state.per_cycle * state.freq_hz; }
  function cycles() { return nFrames() / state.per_cycle; }
  function movieSeconds() { const n = simPx(); return 6 * (n * n * nFrames()) / 8.4e6 * Math.max(0.3, Math.min(3, particlesFor(n) / 160)) + 1; }
  function simSeconds() { return movieSeconds() * (level === "addict" ? 1.15 : 1); }
  function seriesSeconds() { return SWEEP.length * simSeconds(); }
  const MAX_SECONDS = 180, MAX_SERIES_SECONDS = 900;
  function centralWavelength() { const sp = OPTICS.SOURCES[state.source].sample(); return sp.reduce(function (s, p) { return s + p.w * p.l; }, 0); }
  function nLiquid(l0) { return OPTICS.liquidIndex({ glycerol_w: state.material === "liquid" ? state.glycerol_w : 0 }, l0); }
  function condNA() { return Math.max(0.005, Math.min(state.na_c, CONDENSERS[state.condenser].na)); }
  function detectorConfig() {
    return { kind: "camera", pixel_um: ORCA.px, binning: state.binning, bin_charge: false, qe: ORCA.qe, read_noise_e: ORCA.rn, full_well_e: ORCA.fw,
      timing: "global", t_row_s: 0, rows_total: state.roi, crop_row0: 0 };
  }
  function simConfig(g) {
    const ob = objective(), r = rearrangements(state.material, g === undefined ? state.strain : g, state.freq_hz);
    return {
      seed: state.seed, mode: "brightfield", objective: { mag: ob.m, na: ob.na }, illum: { na_in: 0, na_out: condNA() }, source: state.source, light_frac: state.light_frac,
      homodyne: true,   // keep |E_s|^2: the phase shift through a polystyrene bead of a micrometre or more is large, and without it bright field goes below zero
      detector: detectorConfig(), n_px: simPx(), n_frames: nFrames(), frame_rate_hz: frameRate(), exposure_s: state.exposure_ms / 1000,
      particle: "ps", diameter_um: state.diameter_um, size_spread: 0, volume_fraction: state.phi,
      liquid: { glycerol_w: state.material === "liquid" ? state.glycerol_w : 0 }, T_C: state.T_C, cell_um: state.cell_um, focus_um: state.cell_um / 2, drift_um_s: 0,
      shear: { strain: g === undefined ? state.strain : g, freq_hz: state.freq_hz, D_na_um2_s: r.D, brownian: r.brownian }
    };
  }
  function analysisOptions() {
    return { frames_per_period: state.per_cycle, q_min_per_um: state.q_min, q_max_per_um: state.q_max,
      phase: state.x_phase === "off" ? "all" : "rest", noise: state.x_noise === "off" ? "fit" : "camera", compare_published: level === "addict" };
  }

  // ---- controls -------------------------------------------------------------------------------------------
  const objOptions = function () { return OBJECTIVES.filter(function (o) { return o.im === "dry" && o.m >= 10 && o.m <= 40; }).map(function (o) { const i = OBJECTIVES.indexOf(o); return [i, o.n.replace(/^CFI /, "") + "  (" + o.m + "x, NA " + o.na + ")", o.s]; }); };
  function materialHint() {
    const m = MATERIALS[state.material], d = trueD();
    if (level === "curious") return m.note;
    return m.note + " At this strain and frequency the beads wander by D = " + fmtD(d[0]) + " " + MU + "m" + SQ + "/s along the flow and " + fmtD(d[1]) + " along the vorticity (as simulated).";
  }
  function strainHint() {
    const amp = state.strain * GAP_UM / 2, dz = state.cell_um / 2;
    return "The top plate moves " + fmtSig(state.strain * GAP_UM, 3) + " " + MU + "m each way; across the layer simulated around the focus (" + state.cell_um + " " + MU + "m) the beads are carried by up to " + fmtSig(state.strain * dz, 2) + " " + MU + "m more or less than the focal plane." + (state.material === "carbopol" ? (state.strain < 0.6 ? " Below the yield strain (about 60 %)." : " Above the yield strain (about 60 %): the microgel flows.") : "") + (amp > 0 ? "" : "");
  }
  const CONTROLS = [
    { key: "material", lvl: 1, label: "Material", kind: "select", options: Object.keys(MATERIALS).map(function (k) { return [k, MATERIALS[k].label]; }), hint: materialHint },
    { key: "strain", lvl: 1, label: "Strain amplitude", kind: "log", entry: { unit: "%", scale: 100, step: 1, digits: 0 }, min: 0.01, max: 3, fmt: fmtPct, hint: strainHint },
    { key: "freq_hz", lvl: 1, label: "Frequency of the shear", kind: "log", entry: { unit: "Hz", scale: 1, step: 0.1, digits: 2 }, min: 0.1, max: 10, fmt: function (v) { return fmtSig(v, 3) + " Hz"; },
      hint: function () { return "One cycle every " + fmtTime(1 / state.freq_hz) + "." + (state.material === "carbopol" ? " The model assumes the same rearrangement per cycle at any frequency." : ""); } },
    { key: "glycerol_w", lvl: 2, label: "Glycerol in the liquid (by mass)", kind: "lin", min: 0.5, max: 0.95, step: 0.05, fmt: function (v) { return Math.round(100 * v) + " %"; }, when: function () { return state.material === "liquid"; },
      hint: function () { return "Viscosity " + fmtSig(viscosity_mPa_s(), 2) + " mPa s at " + Math.round(state.T_C) + " " + DEG + "C: the beads diffuse with D = " + fmtD(thermalD()) + " " + MU + "m" + SQ + "/s."; } },
    { key: "T_C", lvl: 2, label: "Temperature", kind: "lin", min: 5, max: 60, step: 1, entry: { unit: DEG + "C", scale: 1, step: 1, digits: 0 }, fmt: function (v) { return v.toFixed(0) + " " + DEG + "C"; }, when: function () { return state.material === "liquid"; } },
    { key: "diameter_um", lvl: 2, label: "Tracer beads (polystyrene)", kind: "select", num: true, options: [[1, "1 " + MU + "m"], [2, "2 " + MU + "m"]] },
    { key: "phi", lvl: 3, label: "Volume fraction of beads", kind: "log", min: 0.002, max: 0.03, fmt: function (v) { return fmtSig(100 * v, 2) + " %"; }, hint: function () { return "About " + Math.round(particlesFor(simPx())) + " beads in the simulated layer."; } },
    { key: "cell_um", lvl: 3, label: "Layer simulated around the focus", kind: "lin", min: 20, max: 80, step: 10, fmt: function (v) { return v + " " + MU + "m"; }, hint: function () { return "Of the " + GAP_UM + " " + MU + "m gap; beads further from the focus add only a smooth background."; } },
    { key: "objective", lvl: 2, label: "Objective", kind: "objective", hint: function () { return objective().s + ". Pixel " + fmtSig(pixelUm(), 3) + " " + MU + "m at the sample. A long working distance is needed to focus through the bottom plate into the gap."; } },
    { key: "condenser", lvl: 3, label: "Condenser lens", kind: "select", options: Object.keys(CONDENSERS).map(function (k) { return [k, CONDENSERS[k].label]; }) },
    { key: "na_c", lvl: 2, label: "Aperture diaphragm (condenser NA)", kind: "lin", min: 0.05, max: 0.52, step: 0.01, fmt: function (v) { return Math.min(v, CONDENSERS[state.condenser].na).toFixed(2); },
      hint: function () { return "Open, the layer in focus is thin (a few " + MU + "m): fewer beads at other heights are carried by different amounts within a cycle. Closed down, beads far from focus still show."; } },
    { key: "light_frac", lvl: 3, label: "Lamp brightness (background as a share of the full well)", kind: "log", min: 0.01, max: 0.9, fmt: function (v) { return fmtSig(100 * v, 2) + " %"; } },
    { key: "per_cycle", lvl: 1, label: "Frames per cycle", kind: "select", num: true, options: [[1, "1 (one frame per cycle: echoes only)"], [2, "2"], [4, "4"], [8, "8"]],
      hint: function () { return fmtNum(frameRate()) + " frames/s. " + (state.per_cycle === 1 ? "Every frame is an echo of the one before: the cycle itself is not seen." : "Within each cycle the shear is caught at " + state.per_cycle + " points."); } },
    { key: "n_frames", lvl: 1, label: "Number of frames", kind: "select", num: true, options: [[256, "256"], [512, "512"], [1024, "1024"]],
      hint: function () { return fmtSig(cycles(), 3) + " cycles, " + fmtDur(nFrames() / frameRate()) + ". The browser holds up to " + maxFrames(simPx()) + " frames at " + simPx() + " x " + simPx() + " pixels."; } },
    { key: "exposure_ms", lvl: 2, label: "Exposure time", kind: "log", min: 0.1, max: 50, fmt: function (v) { return fmtSig(v, 2) + " ms"; }, hint: function () { return "The beads move during the exposure; a short one keeps them sharp."; } },
    { key: "binning", lvl: 3, label: "Binning", kind: "select", num: true, options: [[1, "1 x 1"], [2, "2 x 2"]] },
    { key: "roi", lvl: 3, label: "Region of interest on the sensor", kind: "select", num: true, options: ORCA.rois.map(function (r) { return [r, r + " x " + r]; }) },
    { key: "sim_px", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]], hint: function () { return "About " + fmtSig(movieSeconds(), 2) + " s per movie."; } },
    { key: "qrange", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push(
    { key: "x_phase", lvl: 4, label: "Echoes at zero strain", kind: "select", options: ONOFF("every phase of the cycle averaged, as in the paper"),
      hint: function () { return "On: at the echoes only pairs that start when the strain is zero (every half cycle) are used, so beads that moved up or down between two echoes are not shifted along the flow. Off: every starting frame."; } },
    { key: "x_noise", lvl: 4, label: "Noise from the camera", kind: "select", options: ONOFF("B from a quadratic through the first three echoes"),
      hint: function () { return "On: B = 2 (mean count + read noise" + SQ + "), the same at every q. Off: B extrapolated to zero delay from the first three echoes, as in the paper."; } }
  );
  const LAYOUT = [
    ["Sample", [["Material", ["material", "glycerol_w", "T_C", "diameter_um", "phi"]], ["Shear", ["strain", "freq_hz", "cell_um"]]]],
    ["Microscope (Nikon Ti2-E)", [["Bright field", ["objective", "condenser", "na_c", "light_frac"]]]],
    ["Camera and recording", [["Hamamatsu ORCA-Flash4.0 V3", ["per_cycle", "n_frames", "exposure_ms", "binning", "roi", "sim_px"]]]],
    ["Analysis", [["", ["qrange"]], ["Addict: what this page adds", ["x_phase", "x_noise"]]]]
  ];
  const SUMMARY = { "Sample": [["material"], ["strain", "at "], ["freq_hz", "", ""]], "Microscope (Nikon Ti2-E)": [["objective"], ["na_c", "condenser NA "]], "Camera and recording": [["per_cycle", "", " frames per cycle"], ["n_frames", "", " frames"]], "Analysis": [] };
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (sb) { sb[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; c.sub = sb[0]; out.push(c); delete byKey[k]; }); }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, x_phase: 1, x_noise: 1 };

  const ctlEls = {}, blockEls = {}, subEls = [];
  function buildControls() {
    const host = $("ctl-groups"), subs = {};
    CONTROLS.forEach(function (c) {
      if (!blockEls[c.group]) {
        const d = document.createElement("details"); d.className = "cblock"; d.open = !window.matchMedia("(max-width: 63.99rem)").matches;
        d.dataset.block = c.group.split(" ")[0].toLowerCase();
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
        const E = c.entry;
        wrap.innerHTML = '<div class="row"><label for="' + id + '"></label>' + (E ? '<span class="numentry"><input type="number" inputmode="decimal"> ' + E.unit + '</span>' : '<output for="' + id + '"></output>') + '</div><input type="range" id="' + id + '">';
        wrap.querySelector("label").textContent = c.label;
        const inp = wrap.querySelector('input[type="range"]'), out = wrap.querySelector("output"), num = wrap.querySelector('input[type="number"]');
        if (c.kind === "log") { inp.min = 0; inp.max = 1000; inp.step = 1; } else { inp.min = c.min; inp.max = c.max; inp.step = c.step; }
        const read = function () { return c.kind === "log" ? c.min * Math.pow(c.max / c.min, inp.value / 1000) : parseFloat(inp.value); };
        const show = function (v) { const t = c.fmt(v); if (out) out.textContent = t; else num.value = +(v * E.scale).toFixed(E.digits); inp.setAttribute("aria-valuetext", t); };
        if (num) {
          num.min = c.min * E.scale; num.max = c.max * E.scale; num.step = E.step;
          num.setAttribute("aria-label", c.label + " (" + E.unit + ")");
          num.addEventListener("change", function () { const v = parseFloat(num.value) / E.scale; if (!isFinite(v)) { show(state[c.key]); return; } state[c.key] = Math.min(c.max, Math.max(c.min, v)); ctlEls[c.key].set(state[c.key]); onChange(c.key); });
        }
        inp.addEventListener("input", function () { show(read()); });
        inp.addEventListener("change", function () { state[c.key] = read(); onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, set: function (v) { inp.value = c.kind === "log" ? 1000 * Math.log(v / c.min) / Math.log(c.max / c.min) : v; show(v); } };
      } else if (c.kind === "select" || c.kind === "objective") {
        wrap.innerHTML = '<label for="' + id + '"></label><select id="' + id + '"></select>';
        wrap.querySelector("label").textContent = c.label;
        const sel = wrap.querySelector("select");
        if (c.kind === "objective") {
          let og = null, last = null;
          objOptions().forEach(function (o) {
            if (o[2] !== last) { og = document.createElement("optgroup"); og.label = o[2]; sel.appendChild(og); last = o[2]; }
            const op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; og.appendChild(op);
          });
        } else c.options.forEach(function (o) { const op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
        sel.addEventListener("change", function () { state[c.key] = (c.num || c.kind === "objective") ? parseFloat(sel.value) : sel.value; onChange(c.key); });
        ctlEls[c.key] = { wrap: wrap, sel: sel, set: function (v) { sel.value = String(v); } };
      } else if (c.kind === "qrange") {
        wrap.innerHTML = '<label></label><div class="qrange"><input type="number" id="c-qmin" step="0.1" min="0" placeholder="from: auto" aria-label="Lowest q"><input type="number" id="c-qmax" step="0.1" min="0" placeholder="to: auto" aria-label="Highest q"></div><div class="hint">Leave empty to use the whole measurable range.</div>';
        wrap.querySelector("label").textContent = c.label;
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
  function ctlShown(c) { return c.lvl <= LEVEL_RANK[level] && (!c.when || c.when()); }
  function ctlText(k) {
    const c = CONTROLS.find(function (x) { return x.key === k; }), e = ctlEls[k];
    if (!c || !e || (c.when && !c.when())) return "";
    if (e.sel) { const o = e.sel.options[e.sel.selectedIndex]; if (!o) return ""; return o.textContent.split(/:| \(/)[0].trim(); }
    return c.fmt ? c.fmt(state[k]) : "";
  }
  function syncBlocks() {
    subEls.forEach(function (s) { s.el.hidden = !s.ctls.some(ctlShown); });
    Object.keys(blockEls).forEach(function (b) {
      const B = blockEls[b]; B.el.hidden = !B.ctls.some(ctlShown);
      B.sum.textContent = (SUMMARY[b] || []).map(function (s) { let t = ctlText(s[0]); if (!t) return ""; if (s[1] && /^[A-Z][a-z]/.test(t)) t = t.charAt(0).toLowerCase() + t.slice(1); return (s[1] || "") + t + (s[2] || ""); }).filter(Boolean).join(", ");
    });
  }
  function syncControls() {
    syncPredictionBases();
    CONTROLS.forEach(function (c) {
      const e = ctlEls[c.kind === "qrange" ? "qrange" : c.key];
      if (c.kind === "qrange") e.set(); else e.set(state[c.key]);
      if (c.when) e.wrap.hidden = !c.when();
      if (e.hint) e.hint.textContent = typeof c.hint === "function" ? c.hint() : c.hint;
    });
    syncBlocks();
  }
  // keep settings possible: the camera's frame rate (always far above what a few frames per cycle need), exposure within
  // a frame, the simulated field within the region read out, the movie in memory
  function constrain() {
    if (state.exposure_ms > 1000 / frameRate()) state.exposure_ms = 1000 / frameRate();
    if (state.sim_px > outPx()) state.sim_px = Math.max(32, outPx());
    if (state.n_frames > maxFrames(simPx())) state.n_frames = [1024, 512, 256].filter(function (n) { return n <= maxFrames(simPx()); })[0] || 256;
  }
  let lastKey = null;
  function onChange(key) {
    lastKey = key; compare = null;
    resetPredictions();
    constrain(); syncControls(); drawCell();
    if (cache.res) drawSeries();
    if (ANALYSIS_KEYS[key]) scheduleAnalysis(); else schedule();
  }

  // ---- reader level -----------------------------------------------------------------
  function setLevel(lv, fromUser) {
    if (!LEVEL_RANK[lv]) lv = "curious";
    level = lv;
    document.documentElement.setAttribute("data-level", lv);
    $("lv-" + lv).checked = true;
    const wide = !window.matchMedia("(max-width: 63.99rem)").matches;
    Object.keys(blockEls).forEach(function (b) { blockEls[b].el.open = wide && (lv !== "curious" || b === "Sample"); });
    const lvOpen = lv === "addict" ? "researcher" : lv;
    document.querySelectorAll("details.math[data-open-at]").forEach(function (d) { d.open = (lvOpen === d.getAttribute("data-open-at")); });
    let changed = false, changedAna = false;
    CONTROLS.forEach(function (c) {
      if (c.lvl <= LEVEL_RANK[lv]) return;
      if (c.kind === "qrange") { if (state.q_min !== null || state.q_max !== null) { state.q_min = null; state.q_max = null; changedAna = true; } return; }
      if (state[c.key] !== BASE[c.key]) { state[c.key] = BASE[c.key]; if (ANALYSIS_KEYS[c.key]) changedAna = true; else changed = true; }
    });
    if (LEVEL_RANK[lv] < 3 && state.seed !== BASE.seed) { state.seed = BASE.seed; changed = true; }
    if (fromUser && location.hash !== "#" + lv) { try { history.replaceState(null, "", "#" + lv); } catch (e) { /* sandboxed previews refuse it */ } }
    constrain(); syncControls(); drawCell();
    if (changed) schedule(); else if (changedAna || (cache.res && lv === "addict" && !cache.res.published)) scheduleAnalysis(); else if (cache.res) renderAll();
  }

  // ---- running (in a background worker when the browser allows it) --------------------
  const cache = { movie: null, res: null, cfg: null, opts: null, series: null };
  let timer = null, worker = null, runToken = 0, workerOK = true, seriesQueued = false, inflight = null, pending = {};
  function workerSource() { return ["optics-src", "movie-src", "engine-src", "shear-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent; }
  function makeWorker() { try { return new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }))); } catch (e) { workerOK = false; return null; } }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { start("simulate"); }, 150); }
  function scheduleAnalysis() { clearTimeout(timer); timer = setTimeout(function () { start(cache.movie ? "analyse" : "simulate"); }, 150); }
  function progress(frac, stage) { $("bar").style.width = (100 * frac).toFixed(1) + "%"; $("status").textContent = stage + "..."; $("runbar").classList.add("busy"); }
  function idle() { $("runbar").classList.remove("busy"); }
  function showError(msg) { const el = $("error"); el.hidden = false; el.textContent = "The run stopped: " + msg; $("status").textContent = "The run stopped: see the message under the settings."; $("bar").style.width = "0"; idle();
    $("hero-result").innerHTML = '<span class="chip bad">The run stopped</span><span>' + msg.replace(/[<>&]/g, "") + '</span>';
    document.querySelector(".steps").classList.add("stale"); }
  function seriesKey() { const s = Object.assign({}, state); delete s.strain; return JSON.stringify(s); }
  function seriesValid() { return !!(cache.series && cache.series.key === seriesKey()); }
  function onMessage(ev) {
    const m = ev.data; if (m.token !== runToken) return;
    if (m.type === "progress") progress(m.frac, m.stage);
    else if (m.type === "error") { inflight = null; seriesQueued = false; showError(m.message); }
    else if (m.type === "done") { inflight = null; finish(m.movie || cache.movie, m.res, m.movie ? pending.cfg : cache.cfg, pending.opts); }
    else if (m.type === "series") { inflight = null; finishSeries(m.points, pending); }
  }
  function ensureWorker(busy) {
    if (worker && busy) { worker.terminate(); worker = null; }
    if (workerOK && !worker) worker = makeWorker();
    if (worker) { worker.onmessage = onMessage; worker.onerror = function (e) { e.preventDefault(); workerOK = false; worker = null; if (pending.kind === "series") startSeries(); else start(pending.kind === "analyse" && !cache.movie ? "simulate" : pending.kind); }; }
    return worker;
  }
  function start(kind) {
    if (kind === "simulate" && simSeconds() > MAX_SECONDS) { ++runToken; inflight = null; showError("this setup would take about " + Math.round(simSeconds() / 60) + " minutes to simulate in the browser: use fewer frames or a smaller simulated image."); return; }
    if (kind === "analyse" && inflight === "simulate") kind = "simulate";
    const token = ++runToken, busy = inflight !== null;
    inflight = kind; $("error").hidden = true;
    pending = { kind: kind, cfg: simConfig(), opts: analysisOptions() };
    if (ensureWorker(busy)) worker.postMessage({ type: kind, token: token, cfg: pending.cfg, opts: pending.opts });
    else runHere(kind, token, pending.cfg, pending.opts);
  }
  function startSeries() {
    if (inflight === "simulate" || inflight === "analyse") { seriesQueued = true; $("series-msg").textContent = "The sweep starts as soon as the bench has finished."; return; }
    seriesQueued = false;
    if (seriesSeconds() > MAX_SERIES_SECONDS) { showError("this sweep would take about " + Math.round(seriesSeconds() / 60) + " minutes in the browser: use fewer frames or a smaller simulated image."); return; }
    const token = ++runToken, busy = inflight !== null;
    inflight = "series"; $("error").hidden = true;
    pending = { kind: "series", key: seriesKey(), list: SWEEP.slice(), opts: analysisOptions(), label: seriesLabel(), material: state.material };
    const cfgs = SWEEP.map(function (g, i) { return Object.assign(simConfig(g), { seed: (state.seed + 104729 * (i + 1)) % 4294967295 }); });
    if (ensureWorker(busy)) worker.postMessage({ type: "series", token: token, list: SWEEP, cfgs: cfgs, opts: pending.opts });
    else seriesHere(token, SWEEP, cfgs, pending);
    $("series-msg").textContent = "Running: about " + fmtDur(seriesSeconds()) + ".";
  }
  function drive(gen, token, a, b, pre) {
    return new Promise(function (resolve) {
      function stepIt() {
        if (token !== runToken) { resolve(null); return; }
        const t0 = performance.now(); let r;
        try { do { r = gen.next(); if (!r.done) progress(a + (b - a) * r.value.frac, (pre || "") + r.value.stage); } while (!r.done && performance.now() - t0 < 30); }
        catch (e) { showError(e.message); resolve(null); return; }
        if (r.done) resolve(r.value); else setTimeout(stepIt, 0);
      }
      stepIt();
    });
  }
  let movieHere = null;
  async function runHere(kind, token, cfg, opts) {
    if (kind === "simulate" || !movieHere) { const mv = await drive(MOVIE.simulate(cfg), token, 0, 0.85); if (!mv) return; movieHere = mv; }
    const res = await drive(SHEAR_ENGINE.analyse(movieHere, opts), token, 0.85, 1); if (!res) return;
    if (opts.compare_published) { try { const p = SHEAR_ENGINE.analyse(movieHere, Object.assign({}, opts, { published_only: true })); const rp = await drive(p, token, 0.95, 1); res.published = { flow: rp.flow, vort: rp.vort }; } catch (e) { res.published = { failed: e.message }; } }
    inflight = null;
    finish(movieHere, res, kind === "simulate" ? cfg : cache.cfg, opts);
  }
  async function seriesHere(token, list, cfgs, p) {
    const pts = [];
    for (let i = 0; i < list.length; i++) {
      const pre = "Strain " + Math.round(100 * list[i]) + " %: ";
      const mv = await drive(MOVIE.simulate(cfgs[i]), token, i / list.length, (i + 0.85) / list.length, pre); if (!mv) return;
      const r = await drive(SHEAR_ENGINE.analyse(mv, p.opts), token, (i + 0.85) / list.length, (i + 1) / list.length, pre); if (!r) return;
      pts.push({ strain: list[i], flow: r.flow, vort: r.vort, truth: mv.truth.shear });
    }
    inflight = null; finishSeries(pts, p);
  }
  function finish(movie, res, cfg, opts) {
    document.querySelector(".steps").classList.remove("stale");
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    if (fresh) {
      // the delay slider at a quarter of a cycle, when the strain has changed most (half a cycle with two frames per cycle, one cycle
      // with one); the lower map zoomed on the patterns used
      const fpp = res.frames_per_period, want = fpp >= 4 ? fpp / 4 : fpp > 1 ? fpp / 2 : fpp;
      $("lag").max = res.lags.length - 1; $("lag").value = Math.max(0, res.lags.indexOf(Math.round(want)));
      const qz = res.window.q_max_used || 3;
      cache.zoomK = Math.max(8, Math.min(movie.n / 2 - 1, Math.round(qz * movie.L_um / (2 * Math.PI)) + 2));
    }
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames (" + fmtSig(movie.T / res.frames_per_period, 3) + " cycles), " + movie.n + " x " + movie.n + " pixels, " + movie.info.n_particles + " beads in the simulated layer."; idle();
    frameIdx = 0;
    renderAll();
    if (seriesQueued) startSeries();
  }
  function finishSeries(points, p) {
    cache.series = { key: p.key, list: p.list, points: points, label: p.label, material: p.material };
    $("bar").style.width = "100%"; idle();
    $("status").textContent = "Sweep done: " + points.length + " strain amplitudes.";
    $("series-msg").textContent = "";
    drawSeries(); if (cache.res) renderResult();
  }

  // ---- colours ---------------------------------------------------------------------
  let C = {};
  function readColors() { const cs = getComputedStyle(document.documentElement); ["ink", "muted", "rule", "accent", "accent-2", "tint", "paper", "panel", "good", "warn", "bad"].forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim(); }); }
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

  // ---- step 1: the shear cell seen from the side ------------------------------------------------------------
  let cellPhase = 0;
  function drawCell() {
    const cv = $("cell"); if (!cv) return;
    readColors();
    const c = prepCanvas(cv), ctx = c.ctx, W = c.W, H = c.H;
    ctx.clearRect(0, 0, W, H);
    const x0 = 30, x1 = W - 30, yb = H - 34, yt = 30, gap = yb - yt, mid = (x0 + x1) / 2;
    const s = Math.sin(cellPhase), shift = Math.min(0.35 * (x1 - x0), state.strain * gap) * s;   // top plate displacement (drawn to scale up to a limit)
    // plates
    ctx.fillStyle = C.tint; ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    ctx.fillRect(x0, yb, x1 - x0, 12); ctx.strokeRect(x0, yb, x1 - x0, 12);
    ctx.fillRect(x0 + shift, yt - 12, x1 - x0, 12); ctx.strokeRect(x0 + shift, yt - 12, x1 - x0, 12);
    // velocity profile: lines of the sample, tilted by the strain
    ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
    for (let k = -6; k <= 6; k++) { const xb = mid + k * (x1 - x0) / 14; ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xb + shift, yt); ctx.stroke(); }
    // layer in focus and the simulated slab
    const yf = (yb + yt) / 2, slab = gap * state.cell_um / GAP_UM;
    ctx.fillStyle = C["accent-2"]; ctx.globalAlpha = 0.18; ctx.fillRect(x0 + shift / 2 - 4, yf - slab / 2, x1 - x0 + 8, slab); ctx.globalAlpha = 1;
    ctx.strokeStyle = C["accent-2"]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + shift / 2, yf); ctx.lineTo(x1 + shift / 2, yf); ctx.stroke();
    // objective below
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(mid - 22, H); ctx.lineTo(mid - 12, yb + 14); ctx.lineTo(mid + 12, yb + 14); ctx.lineTo(mid + 22, H); ctx.closePath(); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    ctx.font = "12px " + getComputedStyle(document.body).getPropertyValue("--sans");
    ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("moving plate", x0 + shift + 4, yt - 20 < 8 ? 8 : yt - 20);
    ctx.fillText("fixed plate", x0 + 4, yb + 24);
    ctx.fillStyle = C.ink; ctx.textAlign = "right"; ctx.fillText("x, the flow \u2192", x1, yf - slab / 2 - 10);
    $("cell-legend").innerHTML = '<span><i style="background:' + C["accent-2"] + '"></i>Layer in focus, with the ' + state.cell_um + ' ' + MU + 'm simulated around it</span><span><i style="background:' + C.accent + '"></i>Objective, below the fixed plate</span><span>Gap ' + GAP_UM + ' ' + MU + 'm, strain ' + fmtPct(state.strain) + ' (the drawing caps large strains)</span>';
    const o = objective();
    $("fov-specs").innerHTML = o.n + ", condenser NA " + condNA().toFixed(2) + ". Pixel <b>" + fmtSig(pixelUm(), 3) + " " + MU + "m</b> at the sample; the simulated field is " + simPx() + " x " + simPx() + " pixels, " + fmtSig(simPx() * pixelUm(), 3) + " " + MU + "m across. One cycle every " + fmtTime(1 / state.freq_hz) + ", " + state.per_cycle + (state.per_cycle === 1 ? " frame" : " frames") + " per cycle, " + fmtSig(cycles(), 3) + " cycles.";
  }

  // ---- one bead, through focus (from the computed kernel) ----------------------------
  function drawParticle() {
    const info = cache.movie.info, Kk = info.kernel, q = info.kernel_q, z = Kk.z_um, nz = z.length, nq = q.length;
    const host = $("particle-strip"); host.innerHTML = "";
    const want = [-8, -4, 0, 4, 8].map(function (v) { return v * Math.max(0.5, Math.min(2, centralWavelength() / objective().na / 1.1)); });
    const a = pixelUm() / 2, Npx = 41, half = (Npx - 1) / 2, dq = q[1] - q[0];
    const imgs = []; let vmax = 0;
    want.forEach(function (zw) {
      if (zw < z[0] || zw > z[nz - 1]) { imgs.push(null); return; }
      let iz = 0; for (let j = 0; j < nz; j++) if (Math.abs(z[j] - zw) < Math.abs(z[iz] - zw)) iz = j;
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
      } else cap.textContent = "outside the layer";
      fig.appendChild(cv); fig.appendChild(cap); host.appendChild(fig);
    });
    $("particle-text").textContent = "Each picture is the light a single " + state.diameter_um + " " + MU + "m polystyrene bead changes at that distance from focus, computed from Mie scattering and the optics of the microscope. Beads out of focus still show as rings: within one cycle the shear carries them by different amounts, " + fmtSig(state.strain, 2) + " " + MU + "m for each " + MU + "m above or below the focus.";
  }

  // ---- movie and images ----------------------------------------------------------------
  let frameIdx = 0, playing = true, lastTick = 0, accum = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) playing = false;
  let grey = null;
  function greyRange(movie) { const n2 = movie.n * movie.n, vals = Array.from(movie.frames.subarray(0, n2)).sort(function (a, b) { return a - b; }); return [vals[Math.floor(0.001 * n2)], vals[Math.floor(0.999 * n2)]]; }
  function drawFrame(canvas, movie, t) {
    const n = movie.n; if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(n, n), d = img.data, off = t * n * n, lo = grey[0], span = grey[1] - grey[0] || 1;
    for (let p = 0; p < n * n; p++) { const v = Math.max(0, Math.min(255, 255 * (movie.frames[off + p] - lo) / span)); d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = v; d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function lagIndex() { return Math.min(parseInt($("lag").value, 10), cache.res.lags.length - 1); }
  function lagFrames() { return cache.res.lags[lagIndex()]; }
  let diffScale = null;
  function drawDiff(t) {
    const movie = cache.movie, n = movie.n, m = lagFrames(), f1 = t % (movie.T - m), f2 = f1 + m, c = $("diff");
    if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data, o1 = f1 * n * n, o2 = f2 * n * n;
    if (diffScale === null) {
      // one scale for every delay: the difference a quarter of a cycle apart (or one frame apart), so that echoes look as dark as they are
      const h = Math.max(1, Math.round(cache.res.frames_per_period / 4)); let s = 0;
      for (let p = 0; p < n * n; p++) { const v = movie.frames[h * n * n + p] - movie.frames[p]; s += v * v; }
      diffScale = 3 * Math.sqrt(s / (n * n)) || 1;
    }
    for (let p = 0; p < n * n; p++) { const v = 128 + 127 * (movie.frames[o2 + p] - movie.frames[o1 + p]) / diffScale; d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = Math.max(0, Math.min(255, v)); d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function tick(now) {
    if (cache.movie && cache.res && playing) {
      const fps = Math.max(4, Math.min(20, cache.movie.frame_rate_hz));
      accum += Math.min(0.1, (now - lastTick) / 1000) * fps;
      if (accum >= 1) { frameIdx = (frameIdx + Math.floor(accum)) % cache.movie.T; accum -= Math.floor(accum); drawMovieFrames(); }
    }
    lastTick = now;
    requestAnimationFrame(tick);
  }
  function phaseText(k) {
    const m = cache.res.frames_per_period, j = k % m, ph = 2 * Math.PI * j / m, g = state.strain * Math.sin(ph);
    return "cycle " + (Math.floor(k / m) + 1) + ", strain " + (Math.abs(g) < 1e-9 ? "0" : (g > 0 ? "+" : "") + fmtSig(100 * g, 2) + " %");
  }
  function drawMovieFrames() {
    drawFrame($("movie"), cache.movie, frameIdx);
    drawFrame($("hero-canvas"), cache.movie, frameIdx);
    drawDiff(frameIdx);
    const dt = 1 / cache.movie.frame_rate_hz, fps = Math.max(4, Math.min(20, cache.movie.frame_rate_hz)), speed = fps / cache.movie.frame_rate_hz;
    $("movie-time").textContent = "t = " + fmtSig(frameIdx * dt, 3) + " s of " + fmtDur(cache.movie.T * dt) + ", " + phaseText(frameIdx) + (Math.abs(speed - 1) > 0.01 ? (speed < 1 ? ", slowed down " + fmtNum(1 / speed) + " times" : ", sped up " + fmtNum(speed) + " times") : ", real time");
    cellPhase = 2 * Math.PI * (frameIdx % cache.res.frames_per_period) / cache.res.frames_per_period;
    if (frameIdx % 2 === 0 || cache.res.frames_per_period <= 2) drawCell();
  }

  // ---- map and stripe pattern ------------------------------------------------------------
  let sel = null;
  function pickDefaultSelection() {
    const res = cache.res, n = cache.movie.n, used = res.rows.filter(function (r) { return r.sec[0].used; }), b = used.length ? used[Math.floor(used.length / 2)].b : (res.bins[Math.floor(res.bins.length / 2)] || 10);
    if (!sel || Math.hypot(sel.kx, sel.ky) > n / 2) sel = { kx: Math.max(1, b), ky: 1 };
  }
  function ampOf(b) { const r = cache.res; return b > 1 && r.A[b] > 0 ? { A: r.A[b], B: r.B[b] } : null; }
  function mapIndex(X, Y, n) { const kx = X - n / 2, ky = n / 2 - Y, ix = (kx + n) % n, iy = (-ky + n) % n; return iy * n + ix; }
  function drawMap() {
    const res = cache.res, n = cache.movie.n, map = res.d2d[lagIndex()];
    const c = $("map"); if (c.width !== n) { c.width = n; c.height = n; }
    const vals = []; for (let p = 1; p < n * n; p++) if (map[p] > 0) vals.push(Math.log10(map[p]));
    vals.sort(function (a, b) { return a - b; });
    const lo = vals[Math.floor(0.02 * vals.length)], hi = vals[Math.floor(0.999 * vals.length)];
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let Y = 0; Y < n; Y++) for (let X = 0; X < n; X++) { const v = map[mapIndex(X, Y, n)], col = magma(v > 0 ? (Math.log10(v) - lo) / (hi - lo) : 0), p = 4 * (Y * n + X); d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    drawMapOverlay(); drawFmap();
    const qz = cache.zoomK * 2 * Math.PI / cache.movie.L_um;
    $("zoom-note").textContent = "The centre of the map above, lightly smoothed (grey: the cross along the axes, left out because the edges of the image add artefacts there), " + (level === "curious" ? "stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m" : "q up to " + fmtSig(qz, 2) + " " + MU + "m" + MINUS1) + ", at the same delay. Patterns across the flow lie left and right of the centre.";
  }
  function drawMapOverlay() {
    const ov = $("map-ov"), n = cache.movie.n, S = ov.width, s = S / n, ctx = ov.getContext("2d"); ctx.clearRect(0, 0, S, S);
    const cx = S / 2 + 0.5 * s, cy = S / 2 + 0.5 * s;
    const kopt = cache.res.window.q_opt_per_um * cache.movie.L_um / (2 * Math.PI);
    if ($("kopt-note")) $("kopt-note").hidden = !(kopt < n / 2);
    ctx.lineWidth = 2;
    if (level !== "curious" && kopt < n / 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, kopt * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    // the two sectors of the analysis (+- 20 degrees about q_x and q_y), as faint wedges
    if (level !== "curious") {
      const t = Math.tan(SHEAR_ENGINE.SECTOR_DEG * Math.PI / 180), R = S / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
      [[1, t], [1, -t], [-1, t], [-1, -t], [t, 1], [-t, 1], [t, -1], [-t, -1]].forEach(function (v) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + v[0] * R, cy - v[1] * R); ctx.stroke(); });
    }
    const px = cx + sel.kx * s, py = cy - sel.ky * s;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(2 * cx - px, 2 * cy - py, 6, 0, 2 * Math.PI); ctx.stroke();
  }
  function divColor(f) { const t = Math.max(-1, Math.min(1, f)), a = hexToRgb(C["accent-2"]), b = hexToRgb(C.accent), w = hexToRgb(C.panel); const c = t >= 0 ? lerp3(w, a, t) : lerp3(w, b, -t); return c.map(function (v) { return Math.round(v); }); }
  function zoomIndex(X, Y, K, n) { const kx = X - K, ky = K - Y; return ((-ky + n) % n) * n + ((kx + n) % n); }
  function smoothed(K, n, value) {
    const m = 2 * K + 1, out = new Array(m * m);
    for (let Y = 0; Y < m; Y++) for (let X = 0; X < m; X++) {
      const i0 = zoomIndex(X, Y, K, n); if (!ampOf(cache.res.binOf[i0])) { out[Y * m + X] = null; continue; }
      let w = 0, a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = zoomIndex(X + dx, Y + dy, K, n), v = value(i); if (v === null) continue; const wt = (2 - Math.abs(dx)) * (2 - Math.abs(dy)); w += wt; a += wt * v; }
      out[Y * m + X] = w > 0 ? a / w : null;
    }
    return out;
  }
  function drawFmap() {
    const res = cache.res, n = cache.movie.n, map = res.d2d[lagIndex()], c = $("fmap"); if (!c) return;
    const K = cache.zoomK, m = 2 * K + 1; if (c.width !== m) { c.width = m; c.height = m; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(m, m), d = img.data, greyC = hexToRgb(C.rule);
    const f = smoothed(K, n, function (i) { const e = ampOf(res.binOf[i]); return e ? 1 - (map[i] - e.B) / e.A : null; });
    for (let k = 0; k < m * m; k++) { const col = f[k] !== null ? divColor(f[k]) : greyC, p = 4 * k; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function selRow() { const b = Math.round(Math.hypot(sel.kx, sel.ky)); return cache.res.rows.find(function (r) { return r.b === b; }) || null; }
  function drawStripes() {
    const n = cache.movie.n, c = $("stripes"); if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 128 + 110 * Math.cos(2 * Math.PI * (sel.kx * x + sel.ky * (n - 1 - y)) / n), p = 4 * (y * n + x); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = Math.hypot(sel.kx, sel.ky), q = 2 * Math.PI * k / cache.movie.L_um, spacing = cache.movie.L_um / k, ang = ((Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI) % 180) + 180) % 180;
    const across = ang <= 45 || ang >= 135;
    let txt = "Stripe spacing <b>" + fmtSig(spacing, 2) + " " + MU + "m</b>";
    if (level !== "curious") txt += ", q = <b>" + q.toFixed(2) + " " + MU + "m<sup>-1</sup></b>, direction " + ang + "&deg;";
    txt += across ? ": stripes across the flow, which the shear moves" : ": stripes along the flow, which the shear hardly moves";
    $("pick-out").innerHTML = txt + ". Step 5 follows this spacing through the first cycles."; syncPick();
  }
  function setPick() {
    if (!cache.res) return;
    const k = +$("pick-k").value, a = +$("pick-a").value * Math.PI / 180;
    let kx = Math.round(k * Math.cos(a)), ky = Math.round(k * Math.sin(a)); if (kx === 0 && ky === 0) kx = 1;
    sel = { kx: kx, ky: ky }; fromSlider = true; drawMapOverlay(); drawStripes(); drawCycle();
  }
  let fromSlider = false;
  function syncPick() {
    const n = cache.movie.n, k = Math.hypot(sel.kx, sel.ky), deg = ((Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI) % 180) + 180) % 180, pk = $("pick-k"), pa = $("pick-a");
    pk.max = Math.floor(n / 2) - 1;
    if (!fromSlider) { pk.value = Math.round(k); pa.value = deg; }
    fromSlider = false;
    pk.setAttribute("aria-valuetext", "stripe spacing " + fmtSig(cache.movie.L_um / k, 2) + " micrometres"); pa.setAttribute("aria-valuetext", deg + " degrees");
  }
  function onMapClick(ev) {
    if (!cache.res) return;
    const ov = $("map-ov"), rect = ov.getBoundingClientRect(), n = cache.movie.n;
    const X = Math.floor((ev.clientX - rect.left) / rect.width * n), Y = Math.floor((ev.clientY - rect.top) / rect.height * n);
    const kx = X - n / 2, ky = n / 2 - Y; if (kx === 0 && ky === 0) return;
    sel = { kx: kx, ky: ky }; drawMapOverlay(); drawStripes(); drawCycle();
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
    const ticks = function (lo, hi, log, stepv) {
      const out = [];
      if (log) { for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push({ v: v, major: true }); [2, 5].forEach(function (k) { const w = k * v; if (w >= lo && w <= hi) out.push({ v: w, major: false }); }); } }
      else { const st = stepv || niceStep((hi - lo) / 5); for (let i = Math.ceil(lo / st); i * st <= hi + 1e-9; i++) out.push({ v: Math.abs(i) < 1e-9 ? 0 : i * st, major: true }); }
      return out;
    };
    const lab = function (v, log) { if (!log) return fmtSig(v, 2).replace(/^-0$/, "0"); const e = Math.log10(v); if (Math.abs(e - Math.round(e)) < 1e-9) return e >= -2 && e <= 3 ? fmtSig(v, 1) : "1e" + Math.round(e); return fmtSig(v, 1); };
    ticks(o.x0, o.x1, o.xlog, o.xstep).forEach(function (t) { const x = fx(t.v); ctx.globalAlpha = t.major ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); ctx.globalAlpha = 1; if (t.major || (pw > 380 && o.xlog)) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(lab(t.v, o.xlog), x, m.t + ph + 6); } });
    ticks(o.y0, o.y1, o.ylog).forEach(function (t) { const y = fy(t.v); ctx.globalAlpha = t.major ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.globalAlpha = 1; if (t.major) { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(lab(t.v, o.ylog), m.l - 6, y); } });
    ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(o.xlabel, m.l + pw / 2, c.H - 4);
    ctx.save(); ctx.translate(13, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "middle"; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    return { ctx: ctx, fx: fx, fy: fy, m: m, pw: pw, ph: ph, done: function () { ctx.restore(); } };
  }
  function dot(ctx, x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); } }
  function poly(ctx, pts, col, wd, dash, alpha) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash || []); ctx.globalAlpha = alpha || 1; ctx.beginPath(); let on = false; pts.forEach(function (p) { if (!p) { on = false; return; } if (!on) { ctx.moveTo(p[0], p[1]); on = true; } else ctx.lineTo(p[0], p[1]); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  let qSpan = null;
  function setQSpan() { const w = cache.res.window; qSpan = [w.q_min_used || w.q_lo_per_um, w.q_max_used || w.q_hi_per_um]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }

  // step 5: the first three cycles, f in the two sectors at the q picked on the map
  let compare = null;
  function cycleCurve(res, b, s) { const m = res.frames_per_period, out = []; res.lags.forEach(function (l, li) { if (l <= 3 * m) out.push([l / m, 1 - (res.dq[s][li][b] - res.B_sec[s - 1][b]) / res.A_sec[s - 1][b]]); }); return out; }
  function drawCycle() {
    const res = cache.res; if (!res) return;
    const b = Math.max(2, Math.min(res.nb, Math.round(Math.hypot(sel.kx, sel.ky)))), q = res.q_per_um[b];
    const a = axes($("chart-cycle"), { xlog: false, ylog: false, x0: 0, x1: 3.05, y0: -0.4, y1: 1.15, xstep: 0.5, xlabel: "Delay (cycles)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    if (compare && compare.cycle) [[compare.cycle.x, C["accent-2"]], [compare.cycle.y, C.accent]].forEach(function (p) { poly(ctx, [[a.fx(0), a.fy(1)]].concat(p[0].map(function (v) { return [a.fx(v[0]), a.fy(v[1])]; })), p[1], 2, [2, 4], 0.6); });
    const cx = cycleCurve(res, b, 1), cyv = cycleCurve(res, b, 2);
    [[cx, C["accent-2"]], [cyv, C.accent]].forEach(function (p) {
      poly(ctx, [[a.fx(0), a.fy(1)]].concat(p[0].map(function (v) { return [a.fx(v[0]), a.fy(Math.max(-0.4, Math.min(1.15, v[1])))]; })), p[1], 1.4);
      p[0].forEach(function (v) { const echo = Math.abs(v[0] - Math.round(v[0])) < 1e-9; dot(ctx, a.fx(v[0]), a.fy(Math.max(-0.4, Math.min(1.15, v[1]))), echo ? 4.2 : 2.6, p[1], echo ? C.ink : null); });
    });
    a.done();
    fillNumbers("cycle-numbers", ["Delay (cycles)", "Across the flow (q along x)", "Along the flow (q along y)"], cx.map(function (v, i) { return [v[0], v[1], cyv[i] ? cyv[i][1] : null]; }));
    $("cycle-legend").innerHTML = '<span><i style="background:' + C["accent-2"] + '"></i>Stripes across the flow (q along x)</span><span><i style="background:' + C.accent + '"></i>Stripes along the flow (q along y)</span><span>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / q, 2) + " " + MU + "m" : "q = " + q.toFixed(2) + " " + MU + "m" + MINUS1) + '; large dots: the echoes, whole cycles apart' + (compare && compare.cycle ? '; dotted: ' + compare.label : '') + '</span>';
  }
  // step 6: f at the echoes in each direction (sector 0: q along x, the flow; sector 1: q along y, the vorticity), with the fitted exponentials
  function pickRows(sec) {
    const used = cache.res.rows.filter(function (r) { return r.sec[sec].used; }), pool = used.length >= 2 ? used : cache.res.rows.filter(function (r) { return r.A > r.B && r.sec[sec].f; });
    const n = Math.min(5, pool.length), out = [];
    for (let i = 0; i < n; i++) out.push(pool[Math.round(i * (pool.length - 1) / Math.max(1, n - 1))]);
    return out;
  }
  function drawCurves() {
    const res = cache.res, ts = res.echo_k.map(function (k) { return k * res.period_s; }), x0 = ts[0] * 0.8, x1 = ts[ts.length - 1] * 1.25;
    const picks = [pickRows(0), pickRows(1)];
    [["chart-curves", "curves-legend"], ["chart-curves-v", "curves-legend-v"]].forEach(function (ids, sec) {
      const cv = $(ids[0]); if (!cv) return;
      const a = axes(cv, { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.15, y1: 1.15, xlabel: "Delay (s), whole cycles", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, kT\u2080)" }), ctx = a.ctx;
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
      picks[sec].forEach(function (r) {
        const e = r.sec[sec], col = qColor(qPos(r.q_per_um));
        if (e.used && level !== "curious") { const pts = []; for (let i = 0; i <= 60; i++) { const t = x0 * Math.pow(x1 / x0, i / 60); pts.push([a.fx(t), a.fy(Math.exp(-e.gamma_hz * t))]); } poly(ctx, pts, col, 1.4); }
        (e.f || []).forEach(function (f, i) { if (isFinite(f)) dot(ctx, a.fx(ts[i]), a.fy(Math.max(-0.15, Math.min(1.15, f))), 2.4, col, null); });
      });
      a.done();
      const leg = $(ids[1]); leg.innerHTML = "";
      picks[sec].forEach(function (r) { const s = document.createElement("span"); s.innerHTML = '<i style="background:' + qColor(qPos(r.q_per_um)) + '"></i>' + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / r.q_per_um, 2) + " " + MU + "m" : "q = " + r.q_per_um.toFixed(2) + " " + MU + "m" + MINUS1); leg.appendChild(s); });
    });
    const NAME = ["flow", "vorticity"];
    fillNumbers("curves-numbers", ["Delay (s)"].concat(picks[0].map(function (r) { return NAME[0] + ", q = " + fmtSig(r.q_per_um, 3); }), picks[1].map(function (r) { return NAME[1] + ", q = " + fmtSig(r.q_per_um, 3); })),
      ts.map(function (t, i) { return [t].concat(picks[0].map(function (r) { return r.sec[0].f ? r.sec[0].f[i] : null; }), picks[1].map(function (r) { return r.sec[1].f ? r.sec[1].f[i] : null; })); }));
  }
  function drawDq() {
    const res = cache.res, tD = trueD(cache.cfg.shear.strain);
    const pts = []; res.rows.forEach(function (r) { [0, 1].forEach(function (s) { if (r.sec[s].D_um2_s > 0) pts.push({ q: r.q_per_um, D: r.sec[s].D_um2_s, s: s, used: r.sec[s].used }); }); });
    const vals = pts.map(function (p) { return p.D; }).concat(tD.filter(function (v) { return v > 0; })).concat([res.D_limit.below]);
    const y0 = Math.min.apply(null, vals) / 3, y1 = Math.max.apply(null, vals) * 3;
    const qs = res.rows.map(function (r) { return r.q_per_um; });
    const a = axes($("chart-dq"), { xlog: false, ylog: true, x0: 0, x1: Math.max.apply(null, qs) * 1.04, y0: y0, y1: y1, xlabel: level === "curious" ? "Stripes: wide on the left, fine on the right (q, " + MU + "m" + MINUS1 + ")" : "q (" + MU + "m" + MINUS1 + ")", ylabel: "D (" + MU + "m" + SQ + "/s)" }), ctx = a.ctx;
    const hline = function (v, col, dash, wd) { if (!(v > 0)) return; ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(v)); ctx.lineTo(a.m.l + a.pw, a.fy(v)); ctx.stroke(); ctx.setLineDash([]); };
    hline(tD[0], C["accent-2"], [], 1.6); hline(tD[1], C.accent, [], 1.6);
    if (res.flow.D_um2_s) hline(res.flow.D_um2_s, C["accent-2"], [6, 4], 1.4);
    if (res.vort.D_um2_s) hline(res.vort.D_um2_s, C.accent, [6, 4], 1.4);
    hline(res.D_limit.below, C.muted, [2, 3], 1.2);
    pts.forEach(function (p) { const col = p.s === 0 ? C["accent-2"] : C.accent; dot(ctx, a.fx(p.q + (p.s ? 0.02 : -0.02)), a.fy(p.D), 2.8, p.used ? col : null, p.used ? null : col); });
    a.done();
    fillNumbers("chart-numbers", ["q (" + MU + "m" + MINUS1 + ")", "D across the flow sector (q along x)", "Used", "D along the vorticity (q along y)", "Used"], res.rows.map(function (r) { return [r.q_per_um, r.sec[0].D_um2_s, r.sec[0].used ? "yes" : (r.sec[0].reason || "no"), r.sec[1].D_um2_s, r.sec[1].used ? "yes" : (r.sec[1].reason || "no")]; }));
    const ul = $("dq-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    add(level === "curious" ? "Red: along the flow; blue: across it, along the vorticity. Dots: how fast the beads wander, read from each pattern (hollow: left out). Dashed: their average. Solid: as simulated. Dotted grey: the slowest wandering this movie could show." :
      "Red: q along x (the flow), blue: q along y (the vorticity). Dots: D = \u0393 / q" + SQ + " at each q (hollow: not used). Dashed: mean of ln D over the q used. Solid: as simulated. Dotted grey: the slowest D this movie shows, -ln 0.9 / (q_max" + SQ + " t_max).");
    const why = {}; res.rows.forEach(function (r) { [0, 1].forEach(function (s) { const e = r.sec[s]; if (!e.used && e.reason) why[e.reason] = (why[e.reason] || 0) + 1; }); });
    const wk = Object.keys(why); if (wk.length && level !== "curious") add("Left out (q and sector): " + wk.map(function (k) { return why[k] + ", " + k; }).join("; ") + ".");
  }
  function ampPoints() { const r = cache.res; return r.rows.map(function (x) { return { q: x.q_per_um, A: x.A, B: x.B, used: x.sec[0].used || x.sec[1].used }; }); }
  function ampLine() {
    if (!cache.res) return "";
    const pts = ampPoints().filter(function (p) { return p.A > 0 && p.B > 0; }), use = pts.filter(function (p) { return p.used; }), set = use.length >= 2 ? use : pts;
    if (set.length < 2) return "";
    const r = set.map(function (p) { return p.A / p.B; }).sort(function (a, b) { return a - b; });
    const fx = function (v) { return v >= 1e5 ? v.toExponential(1).replace("e+", "e") : fmtSig(v, 2); };
    return '<p class="small amp-line" style="margin:0.5rem 0 0"><b>Signal and camera noise:</b> over the ' + set.length + (use.length >= 2 ? ' patterns used' : ' patterns') + ', the signal A is ' + fmtSig(r[0], 2) + ' to ' + fmtSig(r[r.length - 1], 2) + ' times the camera noise B' + (level === "curious" ? '' : ' (B = ' + fx(set[0].B) + ')') + '; the chart of A and B is in this step.</p>';
  }
  function drawAmp() {
    const res = cache.res, pts = ampPoints().filter(function (p) { return p.q > 0 && (p.A > 0 || p.B > 0); });
    const vals = []; pts.forEach(function (p) { if (p.A > 0) vals.push(p.A); if (p.B > 0) vals.push(p.B); });
    if (vals.length < 2) return; vals.sort(function (p, q) { return p - q; });
    const y0 = vals[0] / 2.5, y1 = vals[vals.length - 1] * 2.5, qs = pts.map(function (p) { return p.q; });
    const a = axes($("chart-amp"), { xlog: true, ylog: true, x0: Math.min.apply(null, qs) * 0.8, x1: Math.max.apply(null, qs) * 1.25, y0: y0, y1: y1, xlabel: "Wave vector q (" + MU + "m" + MINUS1 + ")", ylabel: "A(q), B(q)" }), ctx = a.ctx;
    const clampY = function (v) { return Math.min(y1 / 1.05, Math.max(y0 * 1.05, v)); };
    poly(ctx, pts.map(function (p) { return p.B > 0 ? [a.fx(p.q), a.fy(clampY(p.B))] : null; }), C.muted, 1.5, [5, 4]);
    pts.forEach(function (p) { if (p.A > 0) dot(ctx, a.fx(p.q), a.fy(clampY(p.A)), p.used ? 3 : 2.4, p.used ? C.accent : null, C.accent); });
    a.done();
    $("amp-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>A: signal at each q (filled: used, hollow: left out)</span><span><i style="background:' + C.muted + '"></i>B: camera noise (dashed)</span>';
    fillNumbers("amp-numbers", ["q (" + MU + "m" + MINUS1 + ")", "A", "B", "Used"], pts.map(function (p) { return [p.q, p.A > 0 ? p.A : null, p.B > 0 ? p.B : null, p.used ? "yes" : "no"]; }));
  }

  // ---- step 7: the strain sweep -----------------------------------------------------------------
  function seriesLabel() { return MATERIALS[state.material].label.replace(/ \(.*$/, "").replace(/^An? /, "").replace(/,.*$/, ""); }
  function takeSnapshot() {
    const s = seriesValid() ? cache.series : null;
    compare = { label: "the earlier " + (s ? "sweep" : "sample") + " (" + seriesLabel() + ")", material: state.material, points: s ? s.points : null, model: SWEEP.map(function (g) { return [g, trueD(g)]; }) };
    if (cache.res) { const b = Math.max(2, Math.min(cache.res.nb, Math.round(Math.hypot(sel.kx, sel.ky)))); compare.cycle = { x: cycleCurve(cache.res, b, 1), y: cycleCurve(cache.res, b, 2) }; compare.label = "the earlier run (" + seriesLabel() + ")"; }
  }
  function drawSeries() {
    const ok = seriesValid(), s = ok ? cache.series : null;
    $("series-figs").hidden = !(ok || (compare && compare.points));
    $("btn-series").textContent = ok ? "Run the sweep again" : cache.series ? "Run the sweep for these settings" : "Run the strain sweep";
    if (!ok && !(compare && compare.points)) { $("series-state").textContent = cache.series ? "The settings changed since the last sweep: run it again to see these." : "Not run yet: about " + fmtDur(seriesSeconds()) + " for these settings."; return; }
    $("series-state").textContent = ok ? "" : "Running the sweep for these settings: the dotted lines are the earlier one.";
    const pts = s ? s.points : [], model = SWEEP.map(function (g) { return [g, trueD(g)]; });
    const vals = [];
    pts.forEach(function (p) { [p.flow, p.vort].forEach(function (e) { if (e.D_um2_s > 0) vals.push(e.D_um2_s); else if (e.bound) vals.push(e.bound.below || e.bound.above); }); });
    model.forEach(function (m) { m[1].forEach(function (v) { if (v > 0) vals.push(v); }); });
    if (compare && compare.points) compare.points.forEach(function (p) { if (p.flow.D_um2_s > 0) vals.push(p.flow.D_um2_s); });
    const y0 = Math.max(1e-7, Math.min.apply(null, vals) / 3), y1 = Math.max.apply(null, vals) * 3;
    const a = axes($("chart-sweep"), { xlog: true, ylog: true, x0: 0.04, x1: 2, y0: y0, y1: y1, xlabel: "Strain amplitude", ylabel: "D (" + MU + "m" + SQ + "/s)" }), ctx = a.ctx;
    const line = function (list, s2, col, dash, wd, alpha) { poly(ctx, list.map(function (m) { const v = m[1][s2]; return v > 0 ? [a.fx(m[0]), a.fy(v)] : null; }), col, wd, dash, alpha); };
    if (compare && compare.points) { line(compare.points.map(function (p) { return [p.strain, [p.flow.D_um2_s, p.vort.D_um2_s]]; }), 0, C.ink, [2, 4], 2, 0.6); }
    line(model, 0, C["accent-2"], [], 1.6, 0.8); line(model, 1, C.accent, [], 1.6, 0.8);
    pts.forEach(function (p) {
      [[p.flow, C["accent-2"], -0.015], [p.vort, C.accent, 0.015]].forEach(function (e) {
        const X = a.fx(p.strain * (1 + e[2]));
        if (e[0].D_um2_s > 0) { const er = e[0].rel_err || 0; if (er > 0) { ctx.strokeStyle = e[1]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, a.fy(e[0].D_um2_s * Math.exp(-er))); ctx.lineTo(X, a.fy(e[0].D_um2_s * Math.exp(er))); ctx.stroke(); } dot(ctx, X, a.fy(e[0].D_um2_s), 3.2, e[1], null); }
        else if (e[0].bound && e[0].bound.below) { const Y = a.fy(e[0].bound.below); ctx.strokeStyle = e[1]; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X - 4, Y); ctx.lineTo(X + 4, Y); ctx.moveTo(X, Y); ctx.lineTo(X, Y + 12); ctx.moveTo(X - 3, Y + 8); ctx.lineTo(X, Y + 12); ctx.lineTo(X + 3, Y + 8); ctx.stroke(); }
        else if (e[0].bound && e[0].bound.above) { const Y = a.fy(e[0].bound.above); ctx.strokeStyle = e[1]; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X - 4, Y); ctx.lineTo(X + 4, Y); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 12); ctx.moveTo(X - 3, Y - 8); ctx.lineTo(X, Y - 12); ctx.lineTo(X + 3, Y - 8); ctx.stroke(); }
      });
    });
    if (state.material === "carbopol") { ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; const xy = a.fx(0.6); ctx.beginPath(); ctx.moveTo(xy, a.m.t); ctx.lineTo(xy, a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]); }
    a.done();
    $("sweep-legend").innerHTML = '<span><i style="background:' + C["accent-2"] + '"></i>Along the flow</span><span><i style="background:' + C.accent + '"></i>Along the vorticity</span><span>Dots: measured; lines: as simulated; arrows: below the slowest this movie shows, or faster than one cycle' + (compare && compare.points ? '; dotted: ' + compare.label : '') + (state.material === "carbopol" ? '; dashed: yield strain' : '') + '</span>';
    fillNumbers("series-numbers", ["Strain", "D along the flow, measured", "simulated", "D along the vorticity, measured", "simulated"], pts.map(function (p) { const t = trueD(p.strain); return [fmtPct(p.strain), p.flow.D_um2_s || (p.flow.bound && p.flow.bound.below ? "< " + fmtD(p.flow.bound.below) : p.flow.bound && p.flow.bound.above ? "> " + fmtD(p.flow.bound.above) : null), t[0], p.vort.D_um2_s || (p.vort.bound && p.vort.bound.below ? "< " + fmtD(p.vort.bound.below) : null), t[1]]; }));
    const ul = $("sweep-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    if (pts.length && state.material === "carbopol") {
      const lo = pts.find(function (p) { return Math.abs(p.strain - 0.2) < 1e-6; }), hi = pts.find(function (p) { return Math.abs(p.strain - 0.8) < 1e-6; });
      if (lo && hi && lo.flow.D_um2_s && hi.flow.D_um2_s) add("From 20 % to 80 % strain the rearrangements along the flow grow " + fmtNum(hi.flow.D_um2_s / lo.flow.D_um2_s) + " times (simulated " + fmtNum(trueD(0.8)[0] / trueD(0.2)[0]) + ")" + (lo.vort.D_um2_s && hi.vort.D_um2_s ? ", along the vorticity " + fmtNum(hi.vort.D_um2_s / lo.vort.D_um2_s) + " times (simulated " + fmtNum(trueD(0.8)[1] / trueD(0.2)[1]) + ")" : "") + ": the microgel yields.");
      // which direction rearranges more, below and above the yield point
      const an = function (p) { return p && p.flow.D_um2_s > 0 && p.vort.D_um2_s > 0 ? p.flow.D_um2_s / p.vort.D_um2_s : null; }, rl = an(lo), rh = an(hi);
      if (rl !== null && rh !== null) add("Flow over vorticity: " + fmtSig(rl, 2) + " at 20 % (simulated " + fmtSig(trueD(0.2)[0] / trueD(0.2)[1], 2) + "), " + fmtSig(rh, 2) + " at 80 % (simulated " + fmtSig(trueD(0.8)[0] / trueD(0.8)[1], 2) + "). In the simulation, set on the microgel of Edera et al. (2021), the beads wander about as much in both directions below the yield point, and more along the flow above it.");
    }
    if (pts.length && state.material === "liquid") add("The liquid gives the same D at every strain: its flow is reversible, and only the Brownian motion of the beads, " + fmtD(thermalD()) + " " + MU + "m" + SQ + "/s, is left.");
    if (pts.length && state.material === "rubber") add("The rubber never rearranges: every point is only a limit, set by how long the movie lasts and the finest pattern used.");
  }

  // ---- result -------------------------------------------------------------------------------
  function verdict() {
    const res = cache.res, t = trueD(cache.cfg.shear.strain), f = res.flow, v = res.vort;
    if (!(f.D_um2_s > 0) && !(v.D_um2_s > 0)) {
      if (t[0] < res.D_limit.below * 1.5) return { cls: "good", text: "No rearrangement seen, as simulated" };
      if (f.bound && f.bound.above) return { cls: "warn", text: "Faster than one cycle: use wider patterns" };
      return { cls: "warn", text: "Rearrangements too slow for this movie" };
    }
    const off = [f, v].map(function (e, i) { return e.D_um2_s > 0 && t[i] > 0 ? Math.abs(Math.log(e.D_um2_s / t[i])) : null; }).filter(function (x) { return x !== null; });
    const worst = Math.max.apply(null, off), tol = Math.max(0.25, 2 * Math.max(f.rel_err || 0, v.rel_err || 0));   // in our tests samples scattered by up to 15 %
    return worst < tol ? { cls: "good", text: "As simulated (within " + Math.round(100 * (Math.exp(tol) - 1)) + " %)" } : worst < 2 * tol ? { cls: "warn", text: "Off by up to " + Math.round(100 * (Math.exp(worst) - 1)) + " %" } : { cls: "bad", text: "Far from the simulation" };
  }
  function describe(e) { return e.D_um2_s > 0 ? fmtD(e.D_um2_s) + (e.rel_err > 0 ? " +- " + fmtSig(100 * e.rel_err, 2) + " %" : "") : e.bound && e.bound.below ? "below " + fmtD(e.bound.below) : e.bound && e.bound.above ? "above " + fmtD(e.bound.above) : "-"; }
  function perCycle(D) { return Math.sqrt(2 * D / state.freq_hz); }
  function renderResult() {
    const res = cache.res, t = trueD(cache.cfg.shear.strain), v = verdict(), f = res.flow, w = res.vort, g = cache.cfg.shear.strain;
    let h = '<div class="eyebrow">Result</div>';
    const Dm = f.D_um2_s > 0 ? f.D_um2_s : w.D_um2_s;
    const both = f.D_um2_s > 0 && w.D_um2_s > 0, nm = function (e) { return fmtSig(1000 * perCycle(e.D_um2_s), 2) + " nm"; };
    h += '<div class="big">' + (Dm > 0 ? (level === "curious" ? (both ? "The beads wander " + nm(f) + " per cycle along the flow, " + nm(w) + " along the vorticity" : "The beads wander " + fmtSig(1000 * perCycle(Dm), 2) + " nm per cycle") : "D<sub>flow</sub> = " + describe(f) + ", D<sub>vorticity</sub> = " + describe(w) + " " + MU + "m" + SQ + "/s") : (f.bound && f.bound.above ? "Faster than one cycle" : "No rearrangement seen")) + '</div>';
    let s;
    if (Dm > 0) {
      s = "At " + fmtPct(g) + " strain and " + fmtSig(state.freq_hz, 2) + " Hz, the shear leaves each bead, per cycle, " + (both ? "about " + nm(f) + " from where it started along the flow (the shear direction) and " + nm(w) + " along the vorticity" : "about " + fmtSig(1000 * perCycle(Dm), 2) + " nm from where it started") + " (" + fmtSig(Math.sqrt(2 * Dm * res.T / (state.freq_hz * res.frames_per_period)), 2) + " " + MU + "m over the whole movie). Along the flow D = " + describe(f) + ", along the vorticity " + describe(w) + " " + MU + "m" + SQ + "/s.";
      if (both) { const r = f.D_um2_s / w.D_um2_s, err = Math.hypot(f.rel_err || 0, w.rel_err || 0); s += Math.abs(Math.log(r)) < Math.max(0.1, 2 * err) ? " The two directions agree within the uncertainty: the rearrangements show no preferred direction." : " The rearrangements along the flow are " + fmtSig(r, 2) + " times those along the vorticity" + (r > 1 ? ": the shear stirs the beads more in its own direction." : "."); }
    }
    else if (f.bound && f.bound.above) s = "Even the widest patterns used lost their echo within one cycle: the material rearranges by more than a stripe spacing per cycle. Wider patterns (a lower magnification) or a gentler strain would show it.";
    else s = "The echoes hardly fade over the " + fmtSig(res.T / res.frames_per_period, 3) + " cycles of the movie: any rearrangement is slower than D = " + fmtD(res.D_limit.below) + " " + MU + "m" + SQ + "/s, about " + fmtSig(1000 * perCycle(res.D_limit.below), 2) + " nm per cycle. A longer movie or finer patterns would lower this limit.";
    h += '<p class="small" style="margin:0">' + s + ' As simulated: ' + fmtD(t[0]) + ' and ' + fmtD(t[1]) + '.</p>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    if (level !== "curious") {
      const row = function (cls, name, a1, a2, rat, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + a1 + '</td><td>' + a2 + '</td><td>' + rat + '</td></tr>'; };
      const ratio = function (a, b) { return a && b && a.D_um2_s > 0 && b.D_um2_s > 0 ? fmtSig(a.D_um2_s / b.D_um2_s, 2) : "-"; };
      let tb = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">D along the flow (' + MU + 'm' + SQ + '/s)</th><th scope="col">D along the vorticity</th><th scope="col">Ratio</th></tr></thead><tbody>';
      tb += row("main", "This page", describe(f), describe(w), ratio(f, w), "echoes at zero strain, B from the camera");
      if (level === "addict" && res.published) {
        const pb = res.published;
        tb += pb.failed ? row("pub", "Published method only", "-", "-", "-", "could not run: " + pb.failed) : row("pub", "Published method only", describe(pb.flow), describe(pb.vort), ratio(pb.flow, pb.vort), "every phase averaged, B from the first three echoes");
      }
      tb += row("truth", "Simulation", fmtD(t[0]), fmtD(t[1]), t[0] > 0 && t[1] > 0 ? fmtSig(t[0] / t[1], 2) : "-", "");
      h += tb + '</tbody></table></div>';
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Echoes</dt><dd>' + res.echo_k.length + ' delays from 1 to ' + res.echo_k[res.echo_k.length - 1] + ' cycles, ' + (res.phase === "rest" ? 'pairs starting at zero strain (every ' + res.rest_every_frames + (res.rest_every_frames === 1 ? ' frame' : ' frames') + ')' : 'every starting frame') + '</dd>';
      h += '<dt>Patterns used</dt><dd>' + (f.n_used ? f.n_used + ' q along the flow (' + fmtSig(f.q_min_used, 2) + '-' + fmtSig(f.q_max_used, 2) + ' ' + MU + 'm' + MINUS1 + ')' : 'none along the flow') + ', ' + (w.n_used ? w.n_used + ' along the vorticity (' + fmtSig(w.q_min_used, 2) + '-' + fmtSig(w.q_max_used, 2) + ')' : 'none along the vorticity') + '</dd>';
      h += '<dt>Noise</dt><dd>B = ' + fmtSig(res.B_camera, 3) + ' from the camera' + (res.noise === "fit" ? ' (not used: B from the first three echoes)' : '') + '</dd>';
      h += '<dt>Limits of this movie</dt><dd>slowest D it shows ' + fmtD(res.D_limit.below) + ', fastest about ' + fmtD(res.D_limit.above) + ' ' + MU + 'm' + SQ + '/s</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h + ampLine();
    const meas = function (e) { return e.D_um2_s > 0 ? fmtD(e.D_um2_s) : e.bound && e.bound.below ? "< " + fmtD(e.bound.below) : e.bound && e.bound.above ? "> " + fmtD(e.bound.above) : "-"; };
    $("hero-result").innerHTML = '<span>D (' + MU + 'm' + SQ + '/s) along the flow, simulated</span><span class="n">' + fmtD(t[0]) + '</span><span>measured</span><span class="n">' + meas(f) + '</span><span>along the vorticity, simulated</span><span class="n">' + fmtD(t[1]) + '</span><span>measured</span><span class="n">' + meas(w) + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated bright-field movie of beads in " + MATERIALS[state.material].label.replace(/ \(.*$/, "").replace(/^An? /, "a ").replace(/,.*$/, "") + " sheared at " + fmtPct(g) + ", " + fmtSig(state.freq_hz, 2) + " Hz, field " + fmtSig(cache.movie.L_um, 2) + " " + MU + "m.";
  }
  function renderText() {
    const m = cache.movie, res = cache.res, k = res.frames_per_period;
    $("movie-text").textContent = "The movie shows " + state.diameter_um + " " + MU + "m beads in " + MATERIALS[state.material].label.replace(/ \(.*$/, "").replace(/^An? /, "a ").replace(/,.*$/, "").toLowerCase() + ", sheared at " + fmtPct(state.strain) + " and " + fmtSig(state.freq_hz, 2) + " Hz. " + (k > 1 ? "Within each cycle, beads in focus stay put while those above and below it slide back and forth, the further from focus the more." : "One frame per cycle: every frame catches the plates in the same place.");
    $("movie-specs").innerHTML = objective().n + ". Pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + m.T + " frames at " + fmtNum(m.frame_rate_hz) + " frames/s, " + k + " per cycle, " + fmtSig(m.T / k, 3) + " cycles, exposure " + fmtTime(m.exposure_s) + ". " + m.info.n_particles + " beads in a layer " + cache.cfg.cell_um + " " + MU + "m deep around the focus.";
    $("diff-note").textContent = k > 1 ? "With the delay at a quarter of a cycle the beads above and below the focus have slid along the flow by up to the full strain, and the difference is strong. Half a cycle apart the plates are either back where they were or at the opposite side, depending on where the pair starts, so part of the difference stays. At a whole cycle they are back: in a rubber the difference is only camera noise; in a material that rearranges, what is left is what the shear did not undo." : "With one frame per cycle every delay is a whole number of cycles: the difference shows only what the shear did not undo.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const res = cache.res, s = seriesValid() ? cache.series : null;
    const obj = { microscope: "Nikon Ti2-E", objective: objective().n, contrast: "brightfield", detector: ORCA.label, simulation: cache.cfg, analysis: cache.opts,
      result: { D_flow_um2_s: res.flow.D_um2_s ? +res.flow.D_um2_s.toPrecision(3) : null, D_vorticity_um2_s: res.vort.D_um2_s ? +res.vort.D_um2_s.toPrecision(3) : null, slowest_D_shown: +res.D_limit.below.toPrecision(2) },
      sweep: s ? { strain: s.points.map(function (p) { return p.strain; }), D_flow: s.points.map(function (p) { return p.flow.D_um2_s ? +p.flow.D_um2_s.toPrecision(3) : null; }), D_vorticity: s.points.map(function (p) { return p.vort.D_um2_s ? +p.vort.D_um2_s.toPrecision(3) : null; }) } : null };
    $("settings-json").textContent = JSON.stringify(obj, null, 1).replace(/\[\s+([-\d.e+,\s\[\]nul]+?)\s+\]/g, function (m, a) { return "[" + a.replace(/\s+/g, " ") + "]"; });
    focusableScrollers();
  }
  function renderLag() { const res = cache.res, li = lagIndex(), l = res.lags[li], k = res.frames_per_period; $("lag").max = res.lags.length - 1; const t = fmtDur(res.taus_s[li]) + " (" + (l % k === 0 ? (l / k) + (l / k === 1 ? " cycle" : " cycles") : fmtSig(l / k, 3) + " of a cycle") + ")"; $("lag-out").textContent = t; $("lag").setAttribute("aria-valuetext", t); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.movie); diffScale = null;
    setQSpan(); renderLag(); renderText(); drawCell(); drawParticle(); drawMovieFrames(); drawMap(); drawStripes(); drawCycle(); drawCurves(); drawDq(); drawSeries(); drawAmp(); renderResult(); renderSettings();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const CARDS = [
    { lvl: 1, title: "Below and above the yield point", text: "At 20 % strain the microgel holds: the beads move about 20 nm per cycle along each direction, and the echoes fade only over a hundred cycles, for the finest patterns. At 80 % it flows: the beads move about 0.8 " + MU + "m per cycle, and only the widest patterns keep an echo for a few cycles. The two values are those Edera et al. (2021) measured on Carbopol; in our tests on 128 cycles the page found D along the flow within about 15 % of them, and the jump of more than a thousand times between the two strains.",
      shows: [{ label: "20 %", set: {}, go: "step-rates" }, { label: "80 %", set: { strain: 0.8 }, go: "step-rates" }, { label: "The sweep", set: {}, go: "step-series", series: true }] },
    { lvl: 1, title: "A liquid echoes too", text: "Shear a viscous liquid slowly, and its flow undoes itself exactly: every bead comes back. The echoes still fade, because each bead diffuses on its own, but at a pace set by the temperature and the viscosity, not by the strain. The sweep of step 7 gives a flat line. Edera et al. found that in their cell real liquids also slip and flow sideways, which echo-DDM shows as extra fading; this simulation has no such flows.",
      shows: [{ label: "Liquid at 20 %", set: { material: "liquid" }, go: "step-rates" }, { label: "Liquid at 100 %", set: { material: "liquid", strain: 1 }, go: "step-rates" }, { label: "The sweep", set: { material: "liquid" }, go: "step-series", series: true }] },
    { lvl: 1, title: "A rubber: the floor of the method", text: "An elastic solid never rearranges: within a cycle its patterns scramble and come back, and the echoes stay at 1. The page then gives only the slowest rearrangement this movie could have shown, about 2e-5 " + MU + "m" + SQ + "/s on the standard bench: a movie twice as long halves it. Real experiments use such a sample to find the motion the cell itself adds (Edera et al. found less than 1 nm per cycle).",
      shows: [{ label: "Rubber", set: { material: "rubber" }, go: "step-cycle" }] },
    { lvl: 2, title: "Frames per cycle", text: "With one frame per cycle every frame is an echo: the whole movie goes to the echoes, but the cycle itself, and the scrambling within it, is never seen. With eight the cycle is drawn in detail, and the movie holds a quarter as many cycles. In our tests the rates at the echoes came out the same; the slowest rearrangement the movie shows scales with the number of cycles it holds.",
      shows: [{ label: "1 per cycle", set: { per_cycle: 1 }, go: "step-cycle" }, { label: "8 per cycle", set: { per_cycle: 8 }, go: "step-cycle" }] },
    { lvl: 2, title: "Wider patterns for fast rearrangements", text: "Above the yield point the finest patterns lose their echo within one cycle: no echo is left to follow. Only patterns wider than the distance a bead wanders in a few cycles keep one. A lower magnification brings wider patterns into the image; a higher frequency does not help, if the material rearranges by the same amount in every cycle, as assumed here.",
      shows: [{ label: "80 %, 20x", set: { strain: 0.8 }, go: "step-rates" }, { label: "80 %, 10x", set: { strain: 0.8, objective: objIndexByName("CFI Plan Fluor 10X") }, go: "step-rates" }] },
    { lvl: 3, title: "Echoes at zero strain", text: "A bead that moves up or down between two echoes sits where the shear carries it further or less far, but only while the plates are displaced. Comparing frames that start at zero strain leaves this out; averaging over every phase, as in the paper, adds half the strain squared times the vertical diffusion to the diffusion along the flow: at 80 % about a fifth more, at 150 % about three quarters more. In our tests (three samples each at 80, 100 and 150 %) the page read D along the flow within about 20 %, the published method up to 40 % too high. Switch it off at the Addict level to see the difference in the result table.",
      shows: [{ label: "Liquid at 50 %", set: { material: "liquid", strain: 0.5 }, go: "step-rates" }, { label: "Microgel at 150 %", set: { strain: 1.5 }, go: "step-rates" }] }
  ];
  function buildCards() {
    const host = $("cards");
    CARDS.forEach(function (c) {
      const el = document.createElement("article"); el.className = "card" + (c.lvl === 2 ? " lvl-2" : c.lvl === 3 ? " lvl-3" : "");
      const h = document.createElement("h3"); h.textContent = c.title; el.appendChild(h);
      const p = document.createElement("p"); p.textContent = c.text; el.appendChild(p);
      const b = document.createElement("div"); b.className = "btns";
      c.shows.forEach(function (s) {
        const btn = document.createElement("button"); btn.type = "button"; btn.textContent = s.label;
        btn.addEventListener("click", function () { applyPreset(s.set); if (s.series) startSeries(); document.getElementById(s.go).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
        b.appendChild(btn);
      });
      el.appendChild(b); host.appendChild(el);
    });
  }
  function applyPreset(set) {
    const keep = state.seed, sp = state.sim_px;
    compare = null; state = Object.assign({}, BASE, set);
    state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    if (set.seed !== undefined) state.seed = set.seed;
    resetPredictions();
    constrain(); syncControls(); drawCell(); if (cache.res) drawSeries(); schedule();
  }
  let predicting = false;
  const PREDICT_BASE = {
    solid: function () { return state.material !== "carbopol" || state.per_cycle < 2 ? { text: "This question starts from the microgel filmed at several frames per cycle; the bench now has something else.", set: {} } : null; },
    liquid: function () { return state.material !== "carbopol" ? { text: "This question starts from the microgel; the bench now has something else.", set: {} } : null; }
  };
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
      if (open) box.querySelectorAll("button[data-guess]").forEach(function (x) { x.disabled = !!b; });
    });
  }
  function resetPredictions() {
    if (predicting) return;
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
          takeSnapshot();
          predicting = true;
          if (kind === "solid") state.material = "rubber";
          if (kind === "liquid") { state.material = "liquid"; seriesQueued = true; }
          constrain(); syncControls(); predicting = false;
          if (cache.res) drawSeries();
          schedule();
        });
      });
    });
  }
  function fillNumbers(id, head, rows) {
    const el = $(id); if (!el) return;
    const v = function (x) { return x === null || x === undefined || (typeof x === "number" && !isFinite(x)) ? "-" : typeof x === "number" ? (Math.abs(x) < 0.01 && x !== 0 ? x.toExponential(2) : fmtSig(x, 3)) : x; };
    let h = '<div class="tscroll"><table class="sizing"><thead><tr>' + head.map(function (x) { return '<th scope="col">' + x + '</th>'; }).join("") + '</tr></thead><tbody>';
    rows.forEach(function (r) { h += '<tr>' + r.map(function (x, i) { return i === 0 ? '<th scope="row">' + v(x) + '</th>' : '<td>' + v(x) + '</td>'; }).join("") + '</tr>'; });
    el.querySelector("div").innerHTML = h + '</tbody></table></div>';
  }
  function announce(t) {
    let el = $("sr-live");
    if (!el) { el = document.createElement("div"); el.id = "sr-live"; el.className = "sr-only"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.textContent = ""; setTimeout(function () { el.textContent = t; }, 50);
  }
  function focusableScrollers() { document.querySelectorAll("pre, .eq").forEach(function (el) { if (el.scrollWidth > el.clientWidth + 1) { el.tabIndex = 0; if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.tagName === "PRE" ? "Code" : "Equation"); } else el.removeAttribute("tabindex"); }); }
  document.addEventListener("toggle", function () { focusableScrollers(); }, true);
  window.addEventListener("resize", function () { focusableScrollers(); });
  window.addEventListener("load", function () { focusableScrollers(); });
  document.querySelectorAll("canvas[aria-label]").forEach(function (c) { if (!c.getAttribute("role")) c.setAttribute("role", "img"); });

  // ---- wiring -------------------------------------------------------------------------------
  buildControls(); buildCards(); buildPredictions();
  document.querySelectorAll('input[name="level"]').forEach(function (r) { r.addEventListener("change", function () { if (r.checked) setLevel(r.value, true); }); });
  document.querySelectorAll("[data-level-link]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); setLevel(a.getAttribute("data-level-link"), true); const first = document.querySelector(".step"); if (first) first.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0); }); });
  $("btn-reset").addEventListener("click", function () { compare = null; const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; resetPredictions(); constrain(); syncControls(); drawCell(); schedule(); });
  $("btn-seed").addEventListener("click", function () { state.seed = (state.seed * 1103515245 + 12345) % 2147483647; schedule(); });
  $("btn-play").addEventListener("click", function () { playing = !playing; $("btn-play").textContent = playing ? "Pause" : "Play"; });
  $("btn-play").textContent = playing ? "Pause" : "Play";
  $("lag").addEventListener("input", function () { if (!cache.res) return; renderLag(); drawDiff(frameIdx); drawMap(); });
  $("map-ov").addEventListener("click", onMapClick);
  document.querySelectorAll(".pn-more").forEach(function (b) { b.addEventListener("click", function () { b.closest(".proto-note").classList.add("open"); b.setAttribute("aria-expanded", "true"); }); });
  $("pick-k").addEventListener("input", setPick); $("pick-a").addEventListener("input", setPick);
  $("btn-copy").addEventListener("click", function () {
    const txt = $("settings-json").textContent;
    const fallback = function () { const r = document.createRange(); r.selectNodeContents($("settings-json")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("btn-copy").textContent = "Selected, press copy"; };
    try { navigator.clipboard.writeText(txt).then(function () { $("btn-copy").textContent = "Copied"; }, fallback); } catch (e) { fallback(); }
  });
  let rz = null;
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); drawCell(); if (cache.res) { drawCycle(); drawCurves(); drawDq(); drawSeries(); drawAmp(); drawMapOverlay(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  $("btn-series").addEventListener("click", function () { startSeries(); });

  const PAGE_NAME = "shear";
  function setupHash() {
    const q = [];
    Object.keys(BASE).forEach(function (k) { const v = state[k]; if (JSON.stringify(v) === JSON.stringify(BASE[k])) return; q.push(encodeURIComponent(k) + "=" + encodeURIComponent(k === "objective" ? OBJECTIVES[v].n : v === null ? "null" : String(v))); });
    return "#" + level + (q.length ? "/" + q.join("&") : "");
  }
  const HASH_KEYS = { seed: 1, q_min: 1, q_max: 1 }; CONTROLS.forEach(function (c) { if (c.key) HASH_KEYS[c.key] = 1; });
  function parseHash(h) {
    const parts = String(h || "").replace(/^#/, "").split("/"), set = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      const i = kv.indexOf("="); if (i < 1) return;
      let k, raw; try { k = decodeURIComponent(kv.slice(0, i)); raw = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (!Object.prototype.hasOwnProperty.call(BASE, k) || !HASH_KEYS[k]) return;
      if (k === "objective") { try { set[k] = objIndexByName(raw); } catch (e) { /* objective no longer listed */ } return; }
      if (typeof BASE[k] === "number" || BASE[k] === null) { const x = raw === "null" ? null : parseFloat(raw); if (x === null || isFinite(x)) set[k] = x; return; }
      if (typeof BASE[k] === "string") set[k] = raw;
    });
    return { level: LEVEL_RANK[parts[0]] ? parts[0] : null, set: set };
  }
  function applySetup(p) { if (!Object.keys(p.set).length) return false; applyPreset(p.set); if (p.set.seed !== undefined) state.seed = p.set.seed; return true; }
  $("btn-share").addEventListener("click", function () {
    const h = setupHash(), url = location.href.split("#")[0] + h, msg = $("share-msg");
    try { history.replaceState(null, "", h); } catch (e) { /* sandboxed previews refuse it */ }
    const show = function (ok) { msg.textContent = ok ? "Link copied: it opens this page with these settings." : url; msg.style.wordBreak = ok ? "" : "break-all"; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { show(true); }, function () { show(false); }); else show(false);
  });
  window.addEventListener("hashchange", function () { const p = parseHash(location.hash); if (p.level && p.level !== level) setLevel(p.level, false); applySetup(p); });
  function movieName() { const mv = cache.movie; return "ddm-" + PAGE_NAME + "-" + state.material + "-" + Math.round(100 * state.strain) + "pct-" + mv.n + "x" + mv.n + "x" + mv.T; }
  $("btn-tiff").addEventListener("click", function () {
    const mv = cache.movie; if (!mv || !mv.frames) return;
    DDM_TIFF.save(movieName() + ".tif", DDM_TIFF.tiff(mv.frames, mv.n, mv.T, mv.pixel_um, 1 / mv.frame_rate_hz, "info=Simulated on rcerbino.github.io/ddm, photoelectrons per pixel; " + cache.res.frames_per_period + " frames per cycle, the first at zero strain"), "image/tiff");
  });

  const p0 = parseHash(location.hash);
  setLevel(p0.level || "curious", false);
  if (!applySetup(p0)) schedule();
  requestAnimationFrame(tick);
  window.DDM_PAGE = {
    preset: applyPreset, state: function () { return JSON.parse(JSON.stringify(state)); }, series: startSeries,
    controls: function () { return CONTROLS.filter(function (c) { return c.kind !== "qrange" && (!c.when || c.when()); }).map(function (c) { return { key: c.key, kind: c.kind, lvl: c.lvl, min: c.min, max: c.max, options: c.kind === "objective" ? objOptions().map(function (o) { return o[0]; }) : c.kind === "select" ? c.options.map(function (o) { return o[0]; }) : null }; }); },
    truth: function () { return cache && cache.movie ? cache.movie.truth : null; },
    cfg: function () { return cache && cache.cfg ? JSON.parse(JSON.stringify(cache.cfg)) : null; },
    result: function () { const r = cache && cache.res; if (!r) return null; const s = seriesValid() ? cache.series : null; return { flow: r.flow, vort: r.vort, limit: r.D_limit, truth: trueD(cache.cfg.shear.strain), verdict: verdict().text, published: r.published || null, series: s ? s.points : null }; }
  };
})();
