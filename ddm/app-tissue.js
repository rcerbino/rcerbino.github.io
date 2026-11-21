(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const MU = "\u00b5", SQ = "\u00b2", MINUS1 = "\u207b\u00b9";

  // ---- the microscope: a 10x objective and the ORCA-Flash4.0 V3 (6.5 um pixels), binned; nuclei in fluorescence ------------
  const PIXEL_SENSOR_UM = 6.5, MAG = 10, READ_NOISE = 1.6;
  // ---- the sheet: self-propelled soft discs (tissue-movie.js) ------------------------------------------------------------
  // Presets: the four states of Giavazzi et al. (Soft Matter 14, 3471, 2018) in this model, speeds of the order of those of
  // MCF-10A monolayers (Malinverno et al., Nat. Mater. 16, 587, 2017: about 6 um/h in control, about 30 um/h with RAB5A).
  const STATES = {
    jammed: { label: "Jammed (cells crawl slowly, no alignment)", v0_um_h: 6, J_h: 0, note: "Cells crawl slowly and each in its own direction: their neighbours hold them in place. Like a control monolayer that has filled the dish." },
    fluid: { label: "Fluid (cells crawl hard, no alignment)", v0_um_h: 30, J_h: 0, note: "Cells crawl hard enough to squeeze past their neighbours, each in its own direction: the sheet flows like a liquid." },
    flockliquid: { label: "Flocking liquid (crawl hard, align)", v0_um_h: 30, J_h: 2, note: "Cells crawl hard and steer towards where they are carried: the sheet travels in one direction and flows as it goes, like the reawakened monolayers of Malinverno et al. (2017)." },
    flocksolid: { label: "Flocking solid (crawl slowly, align)", v0_um_h: 8, J_h: 2, note: "Cells crawl slowly but steer together: the whole sheet travels as one rigid block, each cell keeping its neighbours." },
    custom: { label: "Your own settings", note: "Set the crawling speed and the alignment below." }
  };
  const SWEEP_V = [3, 6, 10, 15, 20, 30], SWEEP_J = [0, 2];
  const SWEEP = []; SWEEP_J.forEach(function (J) { SWEEP_V.forEach(function (v) { SWEEP.push({ v0_um_h: v, J_h: J }); }); });

  // the standard sample: a jammed monolayer of 15 um cells, filmed every 5 minutes for 21 hours through a 10x objective,
  // binned 4 x 4 (2.6 um pixels), 128 x 128 pixels
  const BASE = {
    tstate: "jammed", v0_um_h: 6, J_h: 0, Dr_h: 0.5, cell_um: 15, packing: 1.0, muk_h: 20,
    binning: 4, sim_px: 128, frame_min: 5, n_frames: 256, photons: 20000,
    q_min: null, q_max: null, seed: 3, x_comoving: "on", channel: "nuclei", fit_model: "kww"
  };
  let state = Object.assign({}, BASE);
  const LEVEL_RANK = { curious: 1, student: 2, researcher: 3, addict: 4 };
  let level = "curious";
  function fmtNum(v) { return v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function fmtSig(v, d) { if (!Number.isFinite(v)) return "-"; if (v === 0) return "0"; return String(Number(v.toPrecision(d))); }
  function fmtH(h) { return h < 1 ? fmtSig(60 * h, 2) + " min" : fmtSig(h, 2) + " h"; }
  function fmtDur(s) { return s < 120 ? fmtSig(s, 2) + " s" : fmtSig(s / 60, 2) + " min"; }

  function pixelUm() { return PIXEL_SENSOR_UM * state.binning / MAG; }
  function maxFrames(n) { return Math.floor((1 << 23) / (n * n)); }
  function simPx() { return state.sim_px; }
  function nFrames() { return Math.min(state.n_frames, maxFrames(simPx())); }
  function nCells() { const L = simPx() * pixelUm(); return Math.round(state.packing * L * L / (Math.PI / 4 * state.cell_um * state.cell_um * 1.0225)); }
  function movieSeconds() { const n = simPx(); return 1.2 + 2.5 * nCells() / 600 * (nFrames() * state.frame_min / 60 + 6) / 27 * Math.max(1, state.v0_um_h / 15) + 3 * n * n * nFrames() / 8.4e6; }
  function netSeconds() { return 1.5 * nCells() / 600 * nFrames() / 256; }
  function viewSeconds() { return state.channel === "nuclei" ? 0 : 3.5 * nCells() / 600 * nFrames() / 256; }
  function simSeconds() { return movieSeconds() * (level === "addict" ? 1.2 : 1) + netSeconds() + viewSeconds(); }
  function seriesSeconds() { return SWEEP.length * simSeconds(); }
  const MAX_SECONDS = 180, MAX_SERIES_SECONDS = 900;
  function simConfig(over) {
    const s = Object.assign({}, state, over || {});
    return { seed: s.seed, n_px: simPx(), pixel_um: pixelUm(), n_frames: nFrames(), frame_min: s.frame_min, cell_um: s.cell_um, poly: 0.15, packing: s.packing,
      v0_um_h: s.v0_um_h, J_h: s.J_h, Dr_h: s.Dr_h, muk_h: s.muk_h, nucleus_um: 2.5, photons: s.photons, background: 50 * state.binning * state.binning / 16, read_noise_e: READ_NOISE * state.binning };
  }
  function analysisOptions() { return { q_min_per_um: state.q_min, q_max_per_um: state.q_max, cell_area_um2: state.cell_um * state.cell_um, comoving: state.x_comoving !== "off", compare_published: level === "addict", channel: state.channel }; }

  // ---- controls -------------------------------------------------------------------------------------------
  function stateHint() { const s = STATES[state.tstate]; return s.note; }
  // what DDM is run on: the movie of the nuclei, or images drawn from the nuclei found in each frame (step 7)
  const CHANNELS = [
    ["nuclei", "The nuclei, as filmed", "DDM runs on the movie of the nuclei."],
    ["edges", "The cell edges: the network of the nuclei", "In each frame the page finds the nuclei, draws the Voronoi network they make (step 8) and films it as a stain of the cell edges would show it, with the same camera."],
    ["both", "Nuclei and cell edges together", "The light of the cell edges added to the movie of the nuclei, as two stains seen together."]
  ];
  const CHAN_WORDS = { nuclei: "the nuclei", edges: "the cell edges", both: "nuclei and edges" };
  const CONTROLS = [
    { key: "tstate", lvl: 1, label: "The cells", kind: "select", options: Object.keys(STATES).map(function (k) { return [k, STATES[k].label]; }), hint: stateHint },
    { key: "v0_um_h", lvl: 1, label: "How hard the cells crawl", kind: "log", entry: { unit: MU + "m/h", scale: 1, step: 1, digits: 0 }, min: 1, max: 60, fmt: function (v) { return fmtSig(v, 2) + " " + MU + "m/h"; },
      hint: function () { return "The speed a cell would crawl at if nothing held it back. A cell " + state.cell_um + " " + MU + "m across would cross its own size in " + fmtH(state.cell_um / state.v0_um_h) + "."; } },
    { key: "J_h", lvl: 1, label: "Alignment: steering towards where it is pushed", kind: "lin", min: 0, max: 10, step: 0.1, fmt: function (v) { return v === 0 ? "off" : fmtSig(v, 2) + " per hour"; },
      hint: function () { return state.J_h === 0 ? "Off: each cell keeps its own direction, which wanders over about " + fmtH(1 / state.Dr_h) + "." : "Each cell turns towards the direction it moves in within about " + fmtH(1 / state.J_h) + "; on its own its direction wanders over " + fmtH(1 / state.Dr_h) + "."; } },
    { key: "Dr_h", lvl: 2, label: "Random turning (rotational noise)", kind: "log", min: 0.05, max: 5, fmt: function (v) { return fmtSig(v, 2) + " per hour"; } },
    { key: "cell_um", lvl: 2, label: "Cell size", kind: "lin", min: 10, max: 25, step: 1, entry: { unit: MU + "m", scale: 1, step: 1, digits: 0 }, fmt: function (v) { return v + " " + MU + "m"; }, hint: function () { return "About " + nCells() + " cells in the simulated field."; } },
    { key: "packing", lvl: 3, label: "Crowding (sum of cell areas over the dish)", kind: "lin", min: 0.85, max: 1.2, step: 0.01, fmt: function (v) { return fmtSig(v, 3); }, hint: function () { return "Above about 0.84 soft discs touch everywhere; a confluent sheet is well above it."; } },
    { key: "muk_h", lvl: 3, label: "How fast cells push back (stiffness)", kind: "log", min: 5, max: 80, fmt: function (v) { return fmtSig(v, 2) + " per hour"; }, hint: function () { return "An overlap between neighbours relaxes in " + fmtH(1 / state.muk_h) + ". Stiffer cells cage each other more firmly."; } },
    { key: "frame_min", lvl: 1, label: "Time between frames", kind: "log", min: 1, max: 30, entry: { unit: "min", scale: 1, step: 1, digits: 0 }, fmt: function (v) { return fmtSig(v, 2) + " min"; }, hint: function () { return "The movie lasts " + fmtH(nFrames() * state.frame_min / 60) + "."; } },
    { key: "n_frames", lvl: 2, label: "Number of frames", kind: "select", num: true, options: [[128, "128"], [256, "256"], [512, "512"]], hint: function () { return "The browser holds up to " + maxFrames(simPx()) + " frames at " + simPx() + " x " + simPx() + " pixels."; } },
    { key: "binning", lvl: 2, label: "Binning (10x objective)", kind: "select", num: true, options: [[2, "2 x 2 (1.3 " + MU + "m pixels)"], [4, "4 x 4 (2.6 " + MU + "m pixels)"]], hint: function () { return "Field " + fmtSig(simPx() * pixelUm(), 3) + " " + MU + "m across."; } },
    { key: "photons", lvl: 3, label: "Light from each nucleus (photons per frame)", kind: "log", min: 500, max: 1e5, fmt: function (v) { return fmtSig(v, 2); } },
    { key: "sim_px", lvl: 3, label: "Simulated part of the image", kind: "select", num: true, options: [[64, "64 x 64 pixels (fast)"], [128, "128 x 128 pixels"], [256, "256 x 256 pixels (slow)"]], hint: function () { return "About " + fmtSig(movieSeconds(), 2) + " s per movie."; } },
    { key: "channel", lvl: 2, label: "Images analysed", kind: "select", options: CHANNELS.map(function (c) { return [c[0], c[1]]; }), hint: function () { return CHANNELS.find(function (c) { return c[0] === state.channel; })[2]; } },
    { key: "qrange", lvl: 3, label: "Fit range in q (1/" + MU + "m)", kind: "qrange" }
  ];
  const ONOFF = function (off) { return [["on", "On"], ["off", "Off: " + off]]; };
  CONTROLS.push({ key: "x_comoving", lvl: 4, label: "Motion relative to the sheet", kind: "select", options: ONOFF("displacements in the frame of the microscope, as in the paper"),
    hint: function () { return "On: the path of the whole sheet is found from the widest patterns and every frame is moved back by it, so the displacement is that of each cell relative to its neighbours. Off: as recorded."; } });
  const LAYOUT = [
    ["Sample", [["The cells", ["tstate", "v0_um_h", "J_h", "Dr_h"]], ["The sheet", ["cell_um", "packing", "muk_h"]]]],
    ["Microscope and camera", [["10x objective, fluorescent nuclei", ["frame_min", "n_frames", "binning", "photons", "sim_px"]]]],
    ["Analysis", [["", ["channel", "qrange"]], ["Addict: what this page adds", ["x_comoving"]]]]
  ];
  const SUMMARY = { "Sample": [["tstate"], ["v0_um_h", "crawling at "]], "Microscope and camera": [["frame_min", "a frame every "], ["n_frames", "", " frames"]], "Analysis": [["channel"]] };
  (function () {
    const byKey = {}; CONTROLS.forEach(function (c) { byKey[c.kind === "qrange" ? "qrange" : c.key] = c; });
    const out = [];
    LAYOUT.forEach(function (g) { g[1].forEach(function (sb) { sb[1].forEach(function (k) { const c = byKey[k]; if (!c) throw new Error("layout: unknown control " + k); c.group = g[0]; c.sub = sb[0]; out.push(c); delete byKey[k]; }); }); });
    const left = Object.keys(byKey); if (left.length) throw new Error("layout: controls not placed: " + left.join(", "));
    CONTROLS.length = 0; out.forEach(function (c) { CONTROLS.push(c); });
  })();
  const ANALYSIS_KEYS = { q_min: 1, q_max: 1, x_comoving: 1, channel: 1 };
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
  function constrain() {
    if (state.n_frames > maxFrames(simPx())) state.n_frames = [512, 256, 128].filter(function (n) { return n <= maxFrames(simPx()); })[0] || 128;
  }
  let lastKey = null;
  function onChange(key) {
    lastKey = key; compare = null;
    if (key === "tstate" && STATES[state.tstate].v0_um_h !== undefined) { state.v0_um_h = STATES[state.tstate].v0_um_h; state.J_h = STATES[state.tstate].J_h; }
    if (key === "v0_um_h" || key === "J_h") state.tstate = matchState();
    resetPredictions();
    constrain(); syncControls();
    if (cache.res) drawSeries();
    if (ANALYSIS_KEYS[key]) scheduleAnalysis(); else schedule();
  }
  function matchState() { const k = Object.keys(STATES).find(function (s) { return STATES[s].v0_um_h === state.v0_um_h && STATES[s].J_h === state.J_h; }); return k || "custom"; }

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
    constrain(); syncControls();
    if (changed) schedule(); else if (changedAna || (cache.res && lv === "addict" && !cache.res.published)) scheduleAnalysis(); else if (cache.res) renderAll();
  }

  // ---- running (in a background worker when the browser allows it) --------------------
  const cache = { movie: null, res: null, cfg: null, opts: null, series: null };
  let timer = null, worker = null, runToken = 0, workerOK = true, seriesQueued = false, inflight = null, pending = {};
  function workerSource() { return ["tmovie-src", "engine-src", "tengine-src", "tvoronoi-src", "trates-src"].map(function (id) { return document.getElementById(id).textContent; }).join("\n") + "\n" + document.getElementById("worker-src").textContent; }
  function makeWorker() { try { return new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }))); } catch (e) { workerOK = false; return null; } }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { start("simulate"); }, 150); }
  function scheduleAnalysis() { clearTimeout(timer); timer = setTimeout(function () { start(cache.movie ? "analyse" : "simulate"); }, 150); }
  function progress(frac, stage) { $("bar").style.width = (100 * frac).toFixed(1) + "%"; $("status").textContent = stage + "..."; $("runbar").classList.add("busy"); }
  function idle() { $("runbar").classList.remove("busy"); }
  function showError(msg) { const el = $("error"); el.hidden = false; el.textContent = "The run stopped: " + msg; $("status").textContent = "The run stopped: see the message under the settings."; $("bar").style.width = "0"; idle();
    $("hero-result").innerHTML = '<span class="chip bad">The run stopped</span><span>' + msg.replace(/[<>&]/g, "") + '</span>';
    document.querySelector(".steps").classList.add("stale"); }
  function seriesKey() { const s = Object.assign({}, state); delete s.v0_um_h; delete s.J_h; delete s.tstate; return JSON.stringify(s); }
  function seriesValid() { return !!(cache.series && cache.series.key === seriesKey()); }
  function onMessage(ev) {
    const m = ev.data; if (m.token !== runToken) return;
    if (m.type === "progress") progress(m.frac, m.stage);
    else if (m.type === "error") { inflight = null; seriesQueued = false; showError(m.message); }
    else if (m.type === "done") { inflight = null; finish(m.movie || cache.movie, m.res, m.movie ? pending.cfg : cache.cfg, pending.opts, m.view); }
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
    pending = { kind: "series", key: seriesKey(), list: SWEEP.slice(), opts: analysisOptions() };
    const cfgs = SWEEP.map(function (s, i) { return Object.assign(simConfig(s), { seed: (state.seed + 104729 * (i + 1)) % 4294967295 }); });
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
  let movieHere = null, viewsHere = {};
  async function viewHere(mv, cfg, ch, store, token, a, b, pre) {
    if (!ch || ch === "nuclei") return mv;
    if (store && store[ch]) return store[ch];
    const v = await drive(TISSUE_VORONOI.channelMovie(mv, ch, cfg), token, a, b, pre); if (!v) return null;
    if (store) store[ch] = v;
    return v;
  }
  function pubSummary(r) { return { msd: r.msd, taus_s: r.taus_s, state: r.state, psi: r.psi, V_um_h: r.V_um_h }; }
  async function runHere(kind, token, cfg, opts) {
    if (kind === "simulate" || !movieHere) {
      const mv = await drive(TISSUE_MOVIE.simulate(cfg), token, 0, 0.75); if (!mv) return;
      const net = await drive(TISSUE_VORONOI.analyse(mv, { spacing_um: cfg.cell_um }), token, 0.75, 0.85); if (!net) return;
      mv.net = net; movieHere = mv; viewsHere = {};
    }
    const ch = opts.channel || "nuclei", vw = await viewHere(movieHere, cfg, ch, viewsHere, token, 0.85, 0.9); if (!vw) return;
    const res = await drive(TISSUE_ENGINE.analyse(vw, opts), token, 0.9, 1); if (!res) return;
    if (opts.compare_published) { const rp = await drive(TISSUE_ENGINE.analyse(vw, Object.assign({}, opts, { published_only: true })), token, 0.95, 1); res.published = rp ? pubSummary(rp) : { failed: "stopped" }; }
    res.channel = ch;
    if (movieHere.truth.positions) res.truthFs = TISSUE_RATES.truthFs(movieHere.truth.positions, movieHere.T, movieHere.L_um, movieHere.frame_h, res.lags, res.rows.map(function (r) { return r.q_per_um; }));
    inflight = null;
    finish(movieHere, res, kind === "simulate" ? cfg : cache.cfg, opts, ch === "nuclei" ? null : { channel: ch, frames: vw.frames });
  }
  async function seriesHere(token, list, cfgs, p) {
    const pts = [];
    for (let i = 0; i < list.length; i++) {
      const pre = "Run " + (i + 1) + " of " + list.length + ": ";
      const mv = await drive(TISSUE_MOVIE.simulate(cfgs[i]), token, i / list.length, (i + 0.75) / list.length, pre); if (!mv) return;
      const net = await drive(TISSUE_VORONOI.analyse(mv, { spacing_um: cfgs[i].cell_um }), token, (i + 0.75) / list.length, (i + 0.85) / list.length, pre); if (!net) return;
      const vw = await viewHere(mv, cfgs[i], p.opts.channel, null, token, (i + 0.85) / list.length, (i + 0.9) / list.length, pre); if (!vw) return;
      const r = await drive(TISSUE_ENGINE.analyse(vw, p.opts), token, (i + 0.9) / list.length, (i + 1) / list.length, pre); if (!r) return;
      const ns = function (x) { return x ? { p_mean: x.p_mean, hex_frac: x.hex_frac, kept: x.kept } : null; };
      pts.push({ set: list[i], msd: r.msd, taus_s: r.taus_s, msd_beyond: r.msd_beyond, msd_min_um2: r.msd_min_um2, psi: r.psi, V_um_h: r.V_um_h, state: r.state, net: { measured: ns(net.measured), truth: ns(net.truth) }, truth: { msd: mv.truth.msd, order: mv.truth.order, drift_um_h: mv.truth.drift_um_h } });
    }
    inflight = null; finishSeries(pts, p);
  }
  function finish(movie, res, cfg, opts, view) {
    document.querySelector(".steps").classList.remove("stale");
    const fresh = movie !== cache.movie;
    cache.movie = movie; cache.res = res; cache.cfg = cfg; cache.opts = opts;
    // the images analysed, for steps 2 and 3 and the download: the nuclei, or the images drawn from them
    cache.shown = view ? Object.assign({}, movie, { frames: view.frames, channel: view.channel }) : movie;
    if (fresh) {
      // the delay slider at about one hour; the lower map zoomed on the patterns used
      const ta = res.taus_s; let li = 0; for (let k = 0; k < ta.length; k++) if (Math.abs(Math.log(ta[k])) < Math.abs(Math.log(ta[li]))) li = k;
      $("lag").max = ta.length - 1; $("lag").value = li;
      $("net-frame").max = movie.T - 1; $("net-frame").value = 0;
      const qz = res.band.q_hi || 1;
      cache.zoomK = Math.max(8, Math.min(movie.n / 2 - 1, Math.round(qz * movie.L_um / (2 * Math.PI)) + 2));
    }
    pickDefaultSelection();
    $("bar").style.width = "100%";
    $("status").textContent = "Done. " + movie.T + " frames over " + fmtH(movie.T * movie.frame_h) + ", " + movie.n + " x " + movie.n + " pixels, " + movie.truth.n_cells + " cells."; idle();
    frameIdx = 0;
    renderAll();
    if (seriesQueued) startSeries();
  }
  function finishSeries(points, p) {
    cache.series = { key: p.key, list: p.list, points: points };
    $("bar").style.width = "100%"; idle();
    $("status").textContent = "Sweep done: " + points.length + " runs.";
    $("series-msg").textContent = "";
    drawSeries(); if (cache.res) renderResult();
  }

  // ---- step 1: the cells as simulated, coloured by the direction they move in -------------------------------
  function angleColor(a) { const t = (a / (2 * Math.PI) + 1) % 1, h = 360 * t; return "hsl(" + h.toFixed(0) + ",65%,55%)"; }
  function drawCell() {
    const cv = $("cell"); if (!cv) return;
    readColors();
    const c = prepCanvas(cv), ctx = c.ctx, W = c.W, H = c.H;
    ctx.clearRect(0, 0, W, H);
    const o = $("fov-specs");
    if (!cache.movie) { if (o) o.textContent = ""; return; }
    const sn = cache.movie.truth.snapshot, L = cache.movie.L_um, S = Math.min(W, H) / L, x0 = (W - L * S) / 2, y0 = (H - L * S) / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, L * S, L * S); ctx.clip();
    let vmax = 1e-9; for (let i = 0; i < sn.x.length; i++) vmax = Math.max(vmax, Math.hypot(sn.vx[i], sn.vy[i]));
    for (let i = 0; i < sn.x.length; i++) {
      const sp = Math.hypot(sn.vx[i], sn.vy[i]), col = angleColor(Math.atan2(sn.vy[i], sn.vx[i]));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const X = x0 + (sn.x[i] + dx * L) * S, Y = y0 + (L - sn.y[i] + dy * L) * S, r = sn.d[i] / 2 * S;
        if (X < x0 - r || X > x0 + L * S + r || Y < y0 - r || Y > y0 + L * S + r) continue;
        ctx.globalAlpha = 0.25 + 0.6 * sp / vmax; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 0.92 * r, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
        if (dx === 0 && dy === 0 && sp > 0.05 * vmax) { const len = 0.9 * r * sp / vmax; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + len * sn.vx[i] / sp, Y - len * sn.vy[i] / sp); ctx.stroke(); }
      }
    }
    ctx.restore();
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, L * S, L * S);
    $("cell-legend").innerHTML = '<span>Colour: the direction each cell moves in (the same colour everywhere means a flock); paler: slower; arrows: speed</span>';
    const t = cache.movie.truth;
    o.innerHTML = "10x objective, camera binned " + state.binning + " x " + state.binning + ": pixel <b>" + fmtSig(pixelUm(), 3) + " " + MU + "m</b> at the sample; the simulated field is " + simPx() + " x " + simPx() + " pixels, " + fmtSig(cache.movie.L_um, 3) + " " + MU + "m across, with " + t.n_cells + " cells " + state.cell_um + " " + MU + "m across. A frame every " + fmtSig(state.frame_min, 2) + " min for " + fmtH(nFrames() * state.frame_min / 60) + ".";
  }

  // ---- movie and images ----------------------------------------------------------------
  let frameIdx = 0, playing = true, lastTick = 0, accum = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) playing = false;
  let grey = null, greyNuc = null, diffScale = null;
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

  function greyRange(movie) { const n2 = movie.n * movie.n, vals = Array.from(movie.frames.subarray(0, n2)).sort(function (a, b) { return a - b; }); return [vals[Math.floor(0.001 * n2)], vals[Math.floor(0.999 * n2)]]; }
  function drawFrame(canvas, movie, t, range) {
    const n = movie.n; if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
    const g = range || grey, ctx = canvas.getContext("2d"), img = ctx.createImageData(n, n), d = img.data, off = t * n * n, lo = g[0], span = g[1] - g[0] || 1;
    for (let p = 0; p < n * n; p++) { const v = Math.max(0, Math.min(255, 255 * (movie.frames[off + p] - lo) / span)); d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = v; d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function lagIndex() { return Math.min(parseInt($("lag").value, 10), cache.res.lags.length - 1); }
  function lagFrames() { return cache.res.lags[lagIndex()]; }
  function drawDiff(t) {
    const movie = cache.shown, n = movie.n, m = lagFrames(), f1 = t % (movie.T - m), f2 = f1 + m, c = $("diff");
    if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data, o1 = f1 * n * n, o2 = f2 * n * n;
    if (diffScale === null) { const M2 = cache.res.lags[cache.res.lags.length - 1]; let s = 0; for (let p = 0; p < n * n; p++) { const v = movie.frames[M2 * n * n + p] - movie.frames[p]; s += v * v; } diffScale = 3 * Math.sqrt(s / (n * n)) || 1; }
    for (let p = 0; p < n * n; p++) { const v = 128 + 127 * (movie.frames[o2 + p] - movie.frames[o1 + p]) / diffScale; d[4 * p] = d[4 * p + 1] = d[4 * p + 2] = Math.max(0, Math.min(255, v)); d[4 * p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function tick(now) {
    if (cache.movie && cache.res && playing) {
      accum += Math.min(0.1, (now - lastTick) / 1000) * 12;
      if (accum >= 1) { frameIdx = (frameIdx + Math.floor(accum)) % cache.movie.T; accum -= Math.floor(accum); drawMovieFrames(); }
    }
    lastTick = now;
    requestAnimationFrame(tick);
  }
  function drawMovieFrames() {
    drawFrame($("movie"), cache.shown, frameIdx);
    drawFrame($("hero-canvas"), cache.shown, frameIdx);
    drawDiff(frameIdx);
    const h = cache.movie.frame_h;
    $("movie-time").textContent = "t = " + fmtH(frameIdx * h) + " of " + fmtH(cache.movie.T * h) + ", frame " + (frameIdx + 1) + " of " + cache.movie.T + ", played " + fmtNum(12 * h * 3600) + " times faster than real time";
  }

  // ---- map and stripe pattern ------------------------------------------------------------
  let sel = null;
  function pickDefaultSelection() {
    const res = cache.res, n = cache.movie.n, b = res.bins.length ? res.bins[0] : Math.round(res.band.q_peak * res.L_um / (2 * Math.PI)) || 10;
    if (!sel || Math.hypot(sel.kx, sel.ky) > n / 2) sel = { kx: Math.max(1, Math.round(b * Math.cos(0.5))), ky: Math.max(1, Math.round(b * Math.sin(0.5))) };
  }
  function drawStripes() {
    const n = cache.movie.n, c = $("stripes"); if (c.width !== n) { c.width = n; c.height = n; }
    const ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 128 + 110 * Math.cos(2 * Math.PI * (sel.kx * x + sel.ky * (n - 1 - y)) / n), p = 4 * (y * n + x); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = Math.hypot(sel.kx, sel.ky), q = 2 * Math.PI * k / cache.movie.L_um, spacing = cache.movie.L_um / k, ang = ((Math.round(Math.atan2(sel.ky, sel.kx) * 180 / Math.PI) % 180) + 180) % 180;
    let txt = "Stripe spacing <b>" + fmtSig(spacing, 2) + " " + MU + "m</b>, " + fmtSig(spacing / state.cell_um, 2) + " cells";
    if (level !== "curious") txt += ", q = <b>" + q.toFixed(2) + " " + MU + "m<sup>-1</sup></b>, direction " + ang + "&deg;";
    const b = Math.round(k), r = cache.res.rows.find(function (x) { return x.b === b; });
    if (r && r.used) txt += ": one of the patterns that give the displacement (step 7)";
    else if (q < cache.res.band.q_lo) txt += ": wider than the patterns used, where the arrangement of the cells slows the patterns";
    else txt += ": finer than the patterns used, where the nuclei fade into the noise";
    $("pick-out").innerHTML = txt + "."; syncPick();
  }
  function ampOf(b) { const r = cache.res; return b > 1 && r.A[b] > 3 * r.B[b] ? { A: r.A[b], B: r.B[b] } : null; }
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
    $("zoom-note").textContent = "The centre of the map above, lightly smoothed (grey: the cross along the axes, left out because the edges of the image add artefacts there), " + (level === "curious" ? "stripes wider than " + fmtSig(2 * Math.PI / qz, 2) + " " + MU + "m" : "q up to " + fmtSig(qz, 2) + " " + MU + "m" + MINUS1) + ", at the same delay.";
  }
  function drawMapOverlay() {
    const ov = $("map-ov"), n = cache.movie.n, S = ov.width, s = S / n, ctx = ov.getContext("2d"); ctx.clearRect(0, 0, S, S);
    const cx = S / 2 + 0.5 * s, cy = S / 2 + 0.5 * s;
    const kopt = cache.res.window.q_opt_per_um * cache.movie.L_um / (2 * Math.PI);
    if ($("kopt-note")) $("kopt-note").hidden = !(kopt < n / 2);
    ctx.lineWidth = 2;
    if (level !== "curious" && kopt < n / 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, kopt * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
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
  function setPick() {
    if (!cache.res) return;
    const k = +$("pick-k").value, a = +$("pick-a").value * Math.PI / 180;
    let kx = Math.round(k * Math.cos(a)), ky = Math.round(k * Math.sin(a)); if (kx === 0 && ky === 0) kx = 1;
    sel = { kx: kx, ky: ky }; fromSlider = true; drawMapOverlay(); drawStripes();
  }  let fromSlider = false;
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
  // a different marker for each curve of the chart of curves, so that they can be told apart by shape as well as by colour
  const MARKS = ["circle", "square", "triangle", "diamond", "down", "pentagon", "star"];
  function shapePts(x, y, r, j) {
    const s = MARKS[j % MARKS.length], n = { triangle: 3, down: 3, diamond: 4, pentagon: 5, star: 10 }[s], R = 1.3 * r, rot = s === "down" ? Math.PI / 2 : -Math.PI / 2, p = [];
    for (let i = 0; i < n; i++) { const t = rot + 2 * Math.PI * i / n, rr = s === "star" && i % 2 ? 0.5 * R : R; p.push([x + rr * Math.cos(t), y + rr * Math.sin(t)]); }
    return p;
  }
  function mark(ctx, x, y, r, fill, stroke, j) {
    const s = MARKS[j % MARKS.length]; ctx.beginPath();
    if (s === "circle") ctx.arc(x, y, r, 0, 2 * Math.PI);
    else if (s === "square") ctx.rect(x - 0.9 * r, y - 0.9 * r, 1.8 * r, 1.8 * r);
    else { shapePts(x, y, r, j).forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  function markIcon(col, j) {
    const s = MARKS[j % MARKS.length], body = s === "circle" ? '<circle cx="6" cy="6" r="4.5"/>' : s === "square" ? '<rect x="2" y="2" width="8" height="8"/>' :
      '<polygon points="' + shapePts(6, 6, 4, j).map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" ") + '"/>';
    return '<svg class="mk" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="fill:' + col + '">' + body + "</svg>";
  }
  function poly(ctx, pts, col, wd, dash, alpha) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash || []); ctx.globalAlpha = alpha || 1; ctx.beginPath(); let on = false; pts.forEach(function (p) { if (!p) { on = false; return; } if (!on) { ctx.moveTo(p[0], p[1]); on = true; } else ctx.lineTo(p[0], p[1]); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  let qSpan = null;
  function setQSpan() { const w = cache.res.window; qSpan = [w.q_min_used || w.q_lo_per_um, w.q_max_used || w.q_hi_per_um]; }
  function qPos(q) { const lo = Math.log(qSpan[0]), hi = Math.log(qSpan[1]); return hi > lo ? (Math.log(q) - lo) / (hi - lo) : 0.5; }

  // step 5: f in the frame of the sheet (dots) and as recorded (circles), at four q of the band and one wider
  let compare = null;
  function pickRows() {
    const res = cache.res, used = res.rows.filter(function (r) { return r.used; }), out = [];
    const wide = res.rows.filter(function (r) { return r.q_per_um < res.band.q_lo && r.A > 3 * r.B; });
    if (wide.length) out.push(wide[Math.floor(wide.length / 2)]);
    const n = Math.min(4, used.length); for (let i = 0; i < n; i++) out.push(used[Math.round(i * (used.length - 1) / Math.max(1, n - 1))]);
    return out;
  }
  function drawCurves() {
    const res = cache.res, taus = res.taus_s, x0 = taus[0] * 0.8, x1 = taus[taus.length - 1] * 1.25;
    const a = axes($("chart-curves"), { xlog: true, ylog: false, x0: x0, x1: x1, y0: -0.4, y1: 1.15, xlabel: "Delay (hours)", ylabel: level === "curious" ? "How much of the pattern is left" : "f(q, \u0394t)" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0)); ctx.lineTo(a.m.l + a.pw, a.fy(0)); ctx.stroke();
    if (compare && compare.curves) compare.curves.forEach(function (c) { poly(ctx, c.f.map(function (v, i) { return isFinite(v) ? [a.fx(c.t[i]), a.fy(Math.max(-0.4, Math.min(1.15, v)))] : null; }), C.ink, 1.6, [2, 4], 0.5); });
    const pick = pickRows();
    pick.forEach(function (r, j) {
      const col = qColor(qPos(Math.max(qSpan[0], r.q_per_um)));
      const fit = fitOfRow(r);
      if (fit) { const ts = []; for (let k = 0; k <= 80; k++) ts.push(x0 * Math.pow(x1 / x0, k / 80)); poly(ctx, ts.map(function (t) { return [a.fx(t), a.fy(Math.max(-0.4, Math.min(1.15, fit.curve(t))))]; }), col, 1.4); }
      else poly(ctx, r.f.map(function (v, i) { return isFinite(v) ? [a.fx(taus[i]), a.fy(Math.max(-0.4, Math.min(1.15, v)))] : null; }), col, 1.2);
      r.f.forEach(function (f, i) { if (isFinite(f)) mark(ctx, a.fx(taus[i]), a.fy(Math.max(-0.4, Math.min(1.15, f))), 2.4, col, null, j); });
      if (res.comoving && level !== "curious") r.f_lab.forEach(function (f, i) { if (isFinite(f)) mark(ctx, a.fx(taus[i]), a.fy(Math.max(-0.4, Math.min(1.15, f))), 2.6, null, col, j); });
    });
    a.done();
    fillNumbers("curves-numbers", ["Delay (h)"].concat(pick.map(function (r) { return "q = " + fmtSig(r.q_per_um, 3) + (res.comoving ? ", sheet frame" : ""); })), taus.map(function (t, li) { return [t].concat(pick.map(function (r) { return r.f[li]; })); }));
    const leg = $("curves-legend"); leg.innerHTML = "";
    pick.forEach(function (r, j) { const s = document.createElement("span"); s.innerHTML = markIcon(qColor(qPos(Math.max(qSpan[0], r.q_per_um))), j) + (level === "curious" ? "spacing " + fmtSig(2 * Math.PI / r.q_per_um, 2) + " " + MU + "m" : "q = " + r.q_per_um.toFixed(2) + " " + MU + "m" + MINUS1) + (r.used ? "" : " (wider than the band)"); leg.appendChild(s); });
    { const s = document.createElement("span"); s.textContent = (res.comoving && level !== "curious" ? "Dots: in the frame of the sheet; circles: as recorded; " : "Dots: measured; ") + "lines: the fit of step 6 (" + FIT_WORDS[state.fit_model] + ")" + (compare && compare.curves ? "; dotted: " + compare.label : ""); leg.appendChild(s); }
  }
  // ---- step 6: the rate of each pattern against q ---------------------------------------------------------------
  const FIT_MODELS = ["kww", "prw", "cage", "exp"];
  const FIT_WORDS = { kww: "stretched or compressed exponential", prw: "persistent random walk", cage: "exponential to a plateau", exp: "exponential" };
  // the fits of every q with signal, for one model: measured, and of the simulated cells (truth); kept until the next result
  let fitCache = { res: null, by: {} };
  function fitRows() { return cache.res.rows.filter(function (r) { return r.A > 3 * r.B; }); }
  function fitsFor(model) {
    const res = cache.res;
    if (fitCache.res !== res) fitCache = { res: res, by: {} };
    if (fitCache.by[model]) return fitCache.by[model];
    const rows = fitRows(), tf = res.truthFs;
    const meas = rows.map(function (r) { return TISSUE_RATES.fitCurve(res.taus_s, r.f, r.q_per_um, model); });
    const truth = rows.map(function (r) {
      if (!tf) return null;
      const i = tf.q.indexOf(r.q_per_um); return i >= 0 ? TISSUE_RATES.fitCurve(tf.taus, tf.f[i], r.q_per_um, model) : null;
    });
    let bic = 0; meas.forEach(function (o) { if (o) bic += o.n * Math.log(o.rms * o.rms + 1e-12) + o.k * Math.log(o.n); });
    return (fitCache.by[model] = { rows: rows, meas: meas, truth: truth, bic: bic });
  }
  function fitOfRow(r) { const F = fitsFor(state.fit_model), i = F.rows.indexOf(r); return i >= 0 ? F.meas[i] : null; }
  // slope of log rate against log q over the measured points from the start of the band
  function rateSlope(F) {
    const lo = cache.res.band.q_lo, pts = [];
    F.meas.forEach(function (o, i) { if (o && o.measured && F.rows[i].q_per_um >= lo) pts.push([Math.log(F.rows[i].q_per_um), Math.log(o.rate)]); });
    if (pts.length < 3) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0; pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
    const n = pts.length, sl = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { slope: sl, icept: (sy - sl * sx) / n, n: n };
  }
  function median(a) { a = a.filter(Number.isFinite).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : null; }
  function bandParams(F, key) { const lo = cache.res.band.q_lo, hi = cache.res.band.q_hi; return median(F.meas.map(function (o, i) { return o && o.measured && F.rows[i].q_per_um >= lo && F.rows[i].q_per_um <= hi ? key(o) : NaN; })); }
  function drawGamma() {
    const res = cache.res; if (!res || !$("chart-gamma")) return;
    const F = fitsFor(state.fit_model), rows = F.rows;
    if (!rows.length) return;
    const vals = []; F.meas.concat(F.truth).forEach(function (o) { if (o && o.rate > 0) vals.push(o.rate); });
    if (!vals.length) return;
    const qs = rows.map(function (r) { return r.q_per_um; }), x0 = qs[0] / 1.2, x1 = qs[qs.length - 1] * 1.2;
    const y0 = Math.min.apply(null, vals) / 2, y1 = Math.max.apply(null, vals) * 2;
    const a = axes($("chart-gamma"), { xlog: true, ylog: true, x0: x0, x1: x1, y0: y0, y1: y1, xlabel: "q (" + MU + "m" + MINUS1 + ")", ylabel: "Rate \u0393 (per hour)" }), ctx = a.ctx;
    // the band of step 7, and the spacing of neighbours
    ctx.fillStyle = C.tint; ctx.globalAlpha = 0.6; ctx.fillRect(a.fx(res.band.q_lo), a.m.t, a.fx(res.band.q_hi) - a.fx(res.band.q_lo), a.ph); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(a.fx(res.band.q_peak), a.m.t); ctx.lineTo(a.fx(res.band.q_peak), a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]);
    // reference slopes through the middle of the measured band
    const sl = rateSlope(F);
    if (sl) {
      const qm = Math.sqrt(res.band.q_lo * res.band.q_hi), gm = Math.exp(sl.icept + sl.slope * Math.log(qm));
      [[1, [6, 4]], [2, [2, 3]]].forEach(function (p) { poly(ctx, [x0, x1].map(function (q) { return [a.fx(q), a.fy(gm * Math.pow(q / qm, p[0]))]; }), C.muted, 1, p[1], 0.8); });
    }
    poly(ctx, F.truth.map(function (o, i) { return o && o.rate > 0 ? [a.fx(qs[i]), a.fy(o.rate)] : null; }), C["accent-2"], 1.8);
    F.meas.forEach(function (o, i) { if (o && o.rate > 0) dot(ctx, a.fx(qs[i]), a.fy(o.rate), 3, o.measured ? C.accent : null, C.accent); });
    a.done();
    $("gamma-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>Measured (hollow: the curve barely moved within the movie, or had already gone)</span><span><i style="background:' + C["accent-2"] + '"></i>Single simulated cells, same model: an independent check from their true positions, not a fit to these data</span><span>Shaded: the band of step 7; dotted: the spacing of neighbours; grey: slopes 1 (long dashes, going straight) and 2 (short dashes, wandering at random)</span>';
    const pname = { kww: "\u03b2", prw: "t_p (h)", cage: "plateau c", exp: null }[state.fit_model];
    fillNumbers("gamma-numbers", ["q (" + MU + "m" + MINUS1 + ")", "Rate, measured (1/h)", "single cells, simulated", "Measured?", pname ? pname + ", measured" : "", "rms of the fit"].filter(Boolean),
      rows.map(function (r, i) { const o = F.meas[i], t = F.truth[i], p = o ? (state.fit_model === "kww" ? o.params.beta : state.fit_model === "prw" ? o.params.tp : state.fit_model === "cage" ? o.params.c : null) : null; const row = [r.q_per_um, o ? o.rate : null, t ? t.rate : null, o ? (o.measured ? "yes" : o.why === "slow" ? "too slow" : "too fast") : "-"]; if (pname) row.push(p); row.push(o ? o.rms : null); return row; }));
    drawFitShape(F);
  }
  function drawFitShape(F) {
    const fig = $("fig-shape"), m = state.fit_model; if (!fig) return;
    fig.hidden = m === "exp"; if (m === "exp") return;
    const qs = F.rows.map(function (r) { return r.q_per_um; }), x0 = qs[0] / 1.2, x1 = qs[qs.length - 1] * 1.2;
    const key = m === "kww" ? function (o) { return o.params.beta; } : m === "prw" ? function (o) { return o.params.tp; } : function (o) { return o.params.c; };
    const vals = []; F.meas.concat(F.truth).forEach(function (o) { if (o && o.measured) vals.push(key(o)); });
    const o0 = m === "kww" ? { ylog: false, y0: 0.2, y1: 2.1, ylabel: "\u03b2", ref: 1, cap: "Shape of the fitted curve: \u03b2 below 1 means a spread of rates, above 1 persistent, directed motion" }
      : m === "prw" ? { ylog: true, y0: Math.max(1e-3, Math.min.apply(null, vals.concat([0.05])) / 2), y1: Math.max.apply(null, vals.concat([1])) * 2, ylabel: "Persistence time t_p (h)", ref: 1 / state.Dr_h, cap: "Persistence time of the fitted random walk; grey: the time over which a cell on its own forgets its direction (1 / rotational noise)" }
      : { ylog: false, y0: 0, y1: 1.02, ylabel: "Plateau c", ref: null, cap: "Height of the plateau: the share of each pattern that the cage keeps" };
    $("shape-cap").textContent = o0.cap;
    const a = axes($("chart-fitshape"), { xlog: true, ylog: o0.ylog, x0: x0, x1: x1, y0: o0.y0, y1: o0.y1, xlabel: "q (" + MU + "m" + MINUS1 + ")", ylabel: o0.ylabel }), ctx = a.ctx;
    if (o0.ref !== null && o0.ref > o0.y0 && o0.ref < o0.y1) { ctx.strokeStyle = C.muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(o0.ref)); ctx.lineTo(a.m.l + a.pw, a.fy(o0.ref)); ctx.stroke(); ctx.setLineDash([]); }
    poly(ctx, F.truth.map(function (o, i) { return o && o.measured ? [a.fx(qs[i]), a.fy(Math.min(o0.y1, Math.max(o0.y0, key(o))))] : null; }), C["accent-2"], 1.8);
    F.meas.forEach(function (o, i) { if (o && o.measured) dot(ctx, a.fx(qs[i]), a.fy(Math.min(o0.y1, Math.max(o0.y0, key(o)))), 3, C.accent, null); });
    a.done();
    $("fitshape-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>Measured</span><span><i style="background:' + C["accent-2"] + '"></i>Single simulated cells</span>';
  }
  function renderGamma() {
    const el = $("gamma-result"); if (!el || !cache.res) return;
    const sel = $("fit-model");
    if (!sel.options.length) FIT_MODELS.forEach(function (m) { const o = document.createElement("option"); o.value = m; o.textContent = FIT_WORDS[m].charAt(0).toUpperCase() + FIT_WORDS[m].slice(1) + (m === "kww" ? " (default)" : ""); sel.appendChild(o); });
    sel.value = state.fit_model;
    drawGamma();
    // which model describes these curves best
    const ranks = FIT_MODELS.map(function (m) { return { m: m, bic: fitsFor(m).bic }; }).sort(function (x, y) { return x.bic - y.bic; });
    $("fit-best").textContent = "Best for this movie: " + FIT_WORDS[ranks[0].m] + (ranks[0].m === state.fit_model ? " (the one shown)" : "") + ".";
    const F = fitsFor(state.fit_model), sl = rateSlope(F), m = state.fit_model;
    let h = '<div class="eyebrow">The rate against q</div>';
    let s = "";
    if (!sl) s = "Too few patterns faded enough within the movie to read how the rate grows with q. ";
    else if (m === "cage") s += "Over the band of step 7 the rate of the decaying part grows as q<sup>" + fmtSig(sl.slope, 2) + "</sup>; with a plateau it is the rate of the rattling inside the cage, and its slope is not read like the others. ";
    else {
      // a rate growing as q^s goes with displacements growing as t^(2/s) (Gaussian displacements)
      s += "Over the band of step 7 the rate grows as q<sup>" + fmtSig(sl.slope, 2) + "</sup>, as for displacements growing as t<sup>" + fmtSig(2 / sl.slope, 2) + "</sup> (t<sup>1</sup>: wandering at random, t<sup>2</sup>: going straight): ";
      s += sl.slope < 1.4 ? "over the distances these patterns probe, the cells go nearly straight. " : sl.slope < 2.4 ? "close to random wandering over these distances. " : "the cells are held back, more than random wandering would allow: a cage. ";
      if (ranks[0].m === "cage") s += "But the curves are best described with a plateau: over this movie the cells rattle in cages, so here the slope does not mean a fluid; step 7 decides from how far they get. ";
    }
    if (m === "kww") {
      const b = bandParams(F, function (o) { return o.params.beta; }); if (b !== null) s += "The curves are " + (b > 1.1 ? "compressed" : b < 0.9 ? "stretched" : "close to simple exponentials") + " (\u03b2 = " + fmtSig(b, 2) + " in the band). ";
      if (b !== null && b > 1.4 && sl && sl.slope < 1.4) { const v = bandParams(F, function (o) { return 2 * o.rate / o.q; }), vt = cache.res.truthFs ? cache.res.truthFs.vrms : null; s += "For cells going straight at a spread of speeds, 2\u0393/q is their rms speed: " + fmtSig(v, 2) + " " + MU + "m/h" + (vt ? " (simulated, relative to the sheet over one frame: " + fmtSig(vt, 2) + ")" : "") + ". "; }
    }
    if (m === "prw") { const tp = bandParams(F, function (o) { return o.params.tp; }), v = bandParams(F, function (o) { return Math.sqrt(2 * o.params.D / o.params.tp); }), t1 = cache.res.taus_s[0]; if (tp !== null) s += tp < t1 ? "No persistence shows: the walk looks random from the shortest delay. " : "Fitted persistence time " + fmtH(tp) + " and speed " + fmtSig(v, 2) + " " + MU + "m/h in the band: effective values, bent by collisions with neighbours. "; }
    if (m === "cage") { const c = bandParams(F, function (o) { return o.params.c; }), sz = bandParams(F, function (o) { return o.params.c > 0 ? Math.sqrt(-4 * Math.log(o.params.c) / (o.q * o.q)) : NaN; }); if (c !== null) s += c > 0.02 ? "The curves stop at a plateau of " + fmtSig(c, 2) + " in the band, as for a cell rattling over about " + fmtSig(sz, 2) + " " + MU + "m. " : "No plateau: the patterns fade completely. "; }
    const lo = res_band(), agree = []; F.meas.forEach(function (o, i) { const t = F.truth[i]; if (o && o.measured && t && t.rate && F.rows[i].q_per_um >= lo[0] && F.rows[i].q_per_um <= lo[1]) agree.push(Math.abs(Math.log(o.rate / t.rate))); });
    const ag = median(agree);
    h += '<p class="small" style="margin:0">' + s + (ag !== null ? "In the band the rates agree with those of single simulated cells within " + fmtSig(100 * (Math.exp(ag) - 1), 2) + " % (median)." : "") + '</p>';
    if (level !== "curious") {
      h += '<details class="more"><summary>The four models on this movie</summary><div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Model</th><th scope="col">Typical rms of the fit</th><th scope="col">Slope</th><th scope="col">Rank</th></tr></thead><tbody>';
      ranks.forEach(function (r, k) { const G = fitsFor(r.m), s2 = rateSlope(G); h += '<tr><th scope="row">' + FIT_WORDS[r.m] + '</th><td>' + fmtSig(median(G.meas.map(function (o) { return o ? o.rms : NaN; })), 2) + '</td><td>' + (s2 ? fmtSig(s2.slope, 2) : "-") + '</td><td>' + (k + 1) + '</td></tr>'; });
      h += '</tbody></table></div><p class="small">Ranked by the Bayesian information criterion over all q: a model with more parameters must fit enough better to win.</p></details>';
    }
    el.innerHTML = h;
  }
  function res_band() { return [cache.res.band.q_lo, cache.res.band.q_hi]; }

  // step 7: mean squared displacement, measured and simulated
  function trueMsdAt(t) { const m = cache.movie.truth.msd; let i = 0; while (i < m.lag_h.length - 1 && m.lag_h[i + 1] < t) i++; if (i >= m.lag_h.length - 1) return m.um2[m.um2.length - 1]; const w = (Math.log(t) - Math.log(m.lag_h[i])) / (Math.log(m.lag_h[i + 1]) - Math.log(m.lag_h[i])); return Math.exp(Math.log(Math.max(1e-9, m.um2[i])) * (1 - w) + Math.log(Math.max(1e-9, m.um2[i + 1])) * w); }
  function drawMsd() {
    const res = cache.res, taus = res.taus_s, tr = cache.movie.truth.msd, cell2 = state.cell_um * state.cell_um;
    const vals = res.msd.filter(function (v) { return v > 0; }).concat(tr.um2.filter(function (v) { return v > 0; })).concat(res.msd_lab.filter(function (v) { return v > 0; }));
    const y0 = Math.max(1e-3, Math.min.apply(null, vals.concat([res.msd_min_um2])) / 2), y1 = Math.max(2 * cell2, Math.min(Math.max.apply(null, vals) * 2, 1e5));
    const a = axes($("chart-msd"), { xlog: true, ylog: true, x0: taus[0] * 0.8, x1: Math.max(tr.lag_h[tr.lag_h.length - 1], taus[taus.length - 1]) * 1.2, y0: y0, y1: y1, xlabel: "Delay (hours)", ylabel: "<\u0394r" + SQ + "> (" + MU + "m" + SQ + ")" }), ctx = a.ctx;
    const hl = function (v, col, dash) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(v)); ctx.lineTo(a.m.l + a.pw, a.fy(v)); ctx.stroke(); ctx.setLineDash([]); };
    hl(cell2, C.muted, [6, 4]); hl(0.1 * cell2, C.muted, [2, 3]);
    poly(ctx, tr.lag_h.map(function (t, i) { return tr.um2[i] > 0 ? [a.fx(t), a.fy(tr.um2[i])] : null; }), C["accent-2"], 1.8);
    if (compare && compare.msd) poly(ctx, compare.msd.map(function (p) { return p[1] > 0 ? [a.fx(p[0]), a.fy(p[1])] : null; }), C.ink, 2, [2, 4], 0.6);
    res.msd_lab.forEach(function (v, i) { if (v > 0 && res.comoving && level !== "curious") dot(ctx, a.fx(taus[i]), a.fy(v), 2.6, null, C.muted); });
    res.msd.forEach(function (v, i) { if (v > 0) dot(ctx, a.fx(taus[i]), a.fy(v), 3, C.accent, null); });
    a.done();
    fillNumbers("msd-numbers", ["Delay (h)", "Measured, relative to the sheet (" + MU + "m" + SQ + ")", "As recorded", "Simulated, relative to the sheet"], taus.map(function (t, i) { return [t, res.msd[i], res.msd_lab[i], trueMsdAt(t)]; }));
    $("msd-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>Measured by DDM, relative to the sheet</span>' + (res.comoving && level !== "curious" ? '<span><i style="background:' + C.muted + '"></i>Circles: as recorded</span>' : '') + '<span><i style="background:' + C["accent-2"] + '"></i>Simulated</span><span>Dashed: one cell area; dotted: a tenth of it' + (compare && compare.msd ? '; dotted black: ' + compare.label : '') + '</span>';
  }
  // the path of the sheet, measured and simulated
  function drawPath() {
    const res = cache.res, R = res.R_um, tr = cache.movie.truth, span = (cache.movie.T - 1) * cache.movie.frame_h;
    let m = 2 * state.cell_um; R.forEach(function (r) { m = Math.max(m, Math.abs(r[0]), Math.abs(r[1])); }); m = Math.max(m, Math.abs(tr.drift_um_h[0] * span), Math.abs(tr.drift_um_h[1] * span)) * 1.15;
    const a = axes($("chart-path"), { xlog: false, ylog: false, x0: -m, x1: m, y0: -m, y1: m, xlabel: "x (" + MU + "m)", ylabel: "y (" + MU + "m)" }), ctx = a.ctx;
    poly(ctx, [[a.fx(0), a.fy(0)], [a.fx(tr.drift_um_h[0] * span), a.fy(tr.drift_um_h[1] * span)]], C["accent-2"], 1.8, [6, 4]);
    poly(ctx, R.map(function (r) { return [a.fx(r[0]), a.fy(r[1])]; }), C.accent, 1.8);
    dot(ctx, a.fx(0), a.fy(0), 3.5, C.ink, null);
    const e = R[R.length - 1]; dot(ctx, a.fx(e[0]), a.fy(e[1]), 3.5, C.accent, null);
    a.done();
    $("path-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>Measured by DDM (from the widest patterns), over ' + fmtH(span) + '</span><span><i style="background:' + C["accent-2"] + '"></i>Simulated: the mean displacement of all cells (dashed)</span><span>Velocity ' + fmtSig(Math.hypot(res.V_um_h[0], res.V_um_h[1]), 2) + ' +- ' + fmtSig(res.V_err_um_h, 1) + ' ' + MU + 'm/h (simulated ' + fmtSig(Math.hypot(tr.drift_um_h[0], tr.drift_um_h[1]), 2) + ')</span>';
  }
  function ampPoints() { const r = cache.res; return r.rows.map(function (x) { return { q: x.q_per_um, A: x.A, B: x.B, used: x.used }; }); }
  function ampLine() {
    if (!cache.res) return "";
    const pts = ampPoints().filter(function (p) { return p.A > 0 && p.B > 0; }), use = pts.filter(function (p) { return p.used; }), set = use.length >= 2 ? use : pts;
    if (set.length < 2) return "";
    const r = set.map(function (p) { return p.A / p.B; }).sort(function (a, b) { return a - b; });
    const fx = function (v) { return v >= 1e5 ? v.toExponential(1).replace("e+", "e") : fmtSig(v, 2); };
    return '<p class="small amp-line" style="margin:0.5rem 0 0"><b>Signal and camera noise:</b> over the ' + set.length + (use.length >= 2 ? ' patterns used' : ' patterns') + ', the signal A is ' + fmtSig(r[0], 2) + ' to ' + fmtSig(r[r.length - 1], 2) + ' times the camera noise B' + (level === "curious" ? '' : ' (B = ' + fx(set[0].B) + ')') + '; the chart of A and B is in this step.</p>';
  }
  // the power map in words, for screen readers: where the changes are strongest in this run, and where the camera noise takes over
  function describeMap(pts) {
    const c = $("map"); if (!c) return;
    if (!c.dataset.label) c.dataset.label = c.getAttribute("aria-label");
    const ok = pts.filter(function (p) { return p.A > 0 && isFinite(p.A); }).sort(function (a, b) { return a.q - b.q; });
    if (ok.length < 3) { c.setAttribute("aria-label", c.dataset.label); return; }
    let k = 0; ok.forEach(function (p, i) { if (p.A > ok[k].A) k = i; });
    const inv = MU + "m\u207b\u00b9";
    let txt = ". In this run the changes are strongest " + (k === 0 ? "for the widest stripes shown, " : "for stripes about ") + fmtSig(2 * Math.PI / ok[k].q, 2) + " " + MU + "m apart (q = " + fmtSig(ok[k].q, 2) + " " + inv + ")";
    const over = ok.find(function (p, i) { return i > k && p.B > 0 && p.A < p.B; });
    txt += over ? "; from q = " + fmtSig(over.q, 2) + " " + inv + " on, the camera noise is stronger than the signal." : "; the signal stays above the camera noise at every q analysed.";
    c.setAttribute("aria-label", c.dataset.label + txt);
  }
  function drawAmp() {
    const res = cache.res, pts = ampPoints().filter(function (p) { return p.q > 0 && (p.A > 0 || p.B > 0); });
    describeMap(pts);
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

  // ---- step 8: the network of nuclei ------------------------------------------------------------
  const T_KEPT = 4;   // hours: the delay at which the sweep reads the neighbours kept
  // fraction of neighbours kept after h hours, interpolated in log time between the delays measured
  function keptAt(list, h) {
    if (!list) return null;
    const pts = list.filter(function (k) { return k.kept !== null; });
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].lag_h - h) < 1e-9) return pts[i].kept;
      if (i > 0 && pts[i - 1].lag_h < h && pts[i].lag_h > h) { const w = Math.log(h / pts[i - 1].lag_h) / Math.log(pts[i].lag_h / pts[i - 1].lag_h); return pts[i - 1].kept + w * (pts[i].kept - pts[i - 1].kept); }
    }
    return null;
  }
  function msdAt(m, h) { if (!m || !m.lag_h.length) return null; let b = 0; m.lag_h.forEach(function (t, i) { if (Math.abs(Math.log(t / h)) < Math.abs(Math.log(m.lag_h[b] / h))) b = i; }); return Math.abs(Math.log(m.lag_h[b] / h)) < 0.3 ? m.um2[b] : null; }
  function lastKept(list) { const p = (list || []).filter(function (k) { return k.kept !== null; }); return p.length ? p[p.length - 1] : null; }
  function netBrief() {
    const nt = cache && cache.movie && cache.movie.net; if (!nt) return null;
    const m = nt.measured, t = nt.truth || {}, r3 = function (v) { return v === null || v === undefined ? null : +v.toPrecision(3); };
    return { nuclei_per_frame: r3(m.n_detected), cells_simulated: t.n_cells || null, found_frac: r3(t.found_frac), position_error_um: r3(t.loc_err_um), frames_followed: r3(m.track_frames),
      shape_index: r3(m.p_mean), shape_index_simulated: r3(t.p_mean), hexagons: r3(m.hex_frac), hexagons_simulated: r3(t.hex_frac),
      kept_1h: r3(keptAt(m.kept, 1)), kept_1h_simulated: r3(keptAt(t.kept, 1)), kept_4h: r3(keptAt(m.kept, T_KEPT)), kept_4h_simulated: r3(keptAt(t.kept, T_KEPT)),
      msd_1h_tracks_um2: r3(msdAt(m.msd, 1)), msd_1h_simulated_um2: r3(msdAt(t.msd, 1)) };
  }
  // the network of one frame, found on the page (a few milliseconds)
  let netFrame = { movie: null, t: -1, cells: null };
  function networkOf(t) {
    const mv = cache.movie;
    if (netFrame.movie === mv && netFrame.t === t) return netFrame;
    const P = mv.n * mv.n, d = TISSUE_VORONOI.detect(mv.frames.subarray(t * P, (t + 1) * P), mv.n, mv.pixel_um, state.cell_um);
    const v = TISSUE_VORONOI.voronoi(d.x, d.y, mv.L_um, state.cell_um, false, true);
    netFrame = { movie: mv, t: t, x: d.x, y: d.y, cells: v };
    return netFrame;
  }
  function sidesColor(k) { return k <= 4 ? C.warn : k === 5 ? C.accent : k === 6 ? null : k === 7 ? C["accent-2"] : C.bad; }
  function drawNet() {
    const cv = $("net"); if (!cv || !cache.movie) return;
    const mv = cache.movie, t = Math.min(mv.T - 1, parseInt($("net-frame").value, 10) || 0), nw = networkOf(t), byShape = $("net-colour").value === "shape";
    const c = prepCanvas(cv), ctx = c.ctx, W = c.W, H = c.H, S = Math.min(W, H), x0 = (W - S) / 2, y0 = (H - S) / 2, k = S / mv.L_um;
    ctx.clearRect(0, 0, W, H);
    const off = document.createElement("canvas"); drawFrame(off, mv, t, greyNuc);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(off, x0, y0, S, S);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
    let nOk = 0;
    nw.cells.forEach(function (o) {
      if (!o.ok) return; nOk++;
      ctx.beginPath(); o.px.forEach(function (x, j) { const X = x0 + x * k, Y = y0 + o.py[j] * k; if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath();
      const col = byShape ? qColor((o.p - 3.65) / 0.4) : sidesColor(o.sides);
      if (col) { ctx.globalAlpha = 0.45; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < nw.x.length; i++) { ctx.beginPath(); ctx.arc(x0 + nw.x[i] * k, y0 + nw.y[i] * k, 1.6, 0, 2 * Math.PI); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, S, S);
    const out = "t = " + fmtH(t * mv.frame_h) + ", frame " + (t + 1) + " of " + mv.T;
    $("net-frame-out").textContent = out; $("net-frame").setAttribute("aria-valuetext", out);
    const sw = function (col, txt) { return '<span><i style="background:' + col + ';border-radius:2px"></i>' + txt + '</span>'; };
    $("net-legend").innerHTML = (byShape
      ? sw(qColor(0), "shape index 3.65 or less") + sw(qColor(0.4), "3.81") + sw(qColor(1), "4.05 or more (elongated or ragged)")
      : sw(C.warn, "4 sides or fewer") + sw(C.accent, "5 sides") + '<span>6 sides: no colour</span>' + sw(C["accent-2"], "7 sides") + sw(C.bad, "8 or more")) +
      '<span>White dots: the nuclei found; only cells whose outline is complete inside the field are drawn (' + nOk + ' of ' + nw.x.length + ')</span>';
  }
  function drawKept() {
    const nt = cache.movie && cache.movie.net; if (!nt) return;
    const m = nt.measured.kept, tr = nt.truth ? nt.truth.kept : null, lags = m.map(function (k) { return k.lag_h; });
    let lo = 1; [m, tr || []].forEach(function (l) { l.forEach(function (k) { if (k.kept !== null) lo = Math.min(lo, k.kept); }); });
    const y0 = Math.max(0, Math.floor((lo - 0.05) * 10) / 10);
    const a = axes($("chart-kept"), { xlog: true, ylog: false, x0: lags[0] / 1.3, x1: lags[lags.length - 1] * 1.3, y0: y0, y1: 1 + 0.03 * (1 - y0), xlabel: "Delay (hours)", ylabel: "Neighbours kept" }), ctx = a.ctx;
    if (tr) poly(ctx, tr.map(function (k) { return k.kept !== null ? [a.fx(k.lag_h), a.fy(k.kept)] : null; }), C["accent-2"], 1.8);
    m.forEach(function (k) { if (k.kept !== null) dot(ctx, a.fx(k.lag_h), a.fy(k.kept), 3, C.accent, null); });
    a.done();
    $("kept-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>Found from the movie</span><span><i style="background:' + C["accent-2"] + '"></i>As simulated (every cell, true positions)</span>';
    fillNumbers("kept-numbers", ["Delay (h)", "Neighbours kept, from the movie", "simulated", "Cells counted"], m.map(function (k, i) { return [k.lag_h, k.kept, tr ? tr[i].kept : null, k.cells]; }));
  }
  function drawShape() {
    const nt = cache.movie && cache.movie.net; if (!nt) return;
    const m = nt.measured, tr = nt.truth, H = m.p_hist, nb = H.counts.length, w = (H.hi - H.lo) / nb;
    const dens = function (h) { const s = h.counts.reduce(function (p, v) { return p + v; }, 0) || 1; return h.counts.map(function (v) { return v / s / w; }); };
    const dm = dens(H), dt = tr ? dens(tr.p_hist) : null, ymax = Math.max.apply(null, dm.concat(dt || [])) * 1.1 || 1;
    const a = axes($("chart-shape"), { xlog: false, ylog: false, x0: H.lo, x1: H.hi, y0: 0, y1: ymax, xlabel: "Shape index p = perimeter / " + "\u221a" + "area", ylabel: "Share of cells (per unit of p)" }), ctx = a.ctx;
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.45;
    dm.forEach(function (v, i) { const X0 = a.fx(H.lo + i * w), X1 = a.fx(H.lo + (i + 1) * w); ctx.fillRect(X0 + 0.5, a.fy(v), X1 - X0 - 1, a.fy(0) - a.fy(v)); });
    ctx.globalAlpha = 1;
    if (dt) poly(ctx, dt.map(function (v, i) { return [a.fx(H.lo + (i + 0.5) * w), a.fy(v)]; }), C["accent-2"], 1.8);
    [[3.722, "hexagon"], [3.812, "3.81"]].forEach(function (r) { ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a.fx(r[0]), a.m.t); ctx.lineTo(a.fx(r[0]), a.m.t + a.ph); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(r[1], a.fx(r[0]) + 3, a.m.t + 2); });
    a.done();
    $("shape-legend").innerHTML = '<span><i style="background:' + C.accent + ';border-radius:2px"></i>Found from the movie, mean ' + fmtSig(m.p_mean, 3) + '</span><span><i style="background:' + C["accent-2"] + '"></i>As simulated, mean ' + (tr ? fmtSig(tr.p_mean, 3) : "-") + '</span><span>Dashed: a regular hexagon (3.72), and 3.81, where vertex and Voronoi models of tissues go from solid to fluid</span>';
    fillNumbers("shape-numbers", ["p (bin centre)", "Found from the movie", "Simulated"], dm.map(function (v, i) { return [H.lo + (i + 0.5) * w, v, dt ? dt[i] : null]; }));
  }
  function renderNetwork() {
    const nt = cache.movie && cache.movie.net, el = $("net-result"); if (!el) return;
    if (!nt) { el.innerHTML = ""; return; }
    drawNet(); drawKept(); drawShape();
    const m = nt.measured, t = nt.truth, pc = function (v) { return v === null ? "-" : fmtSig(100 * v, 3) + " %"; };
    const k1 = keptAt(m.kept, 1), k1t = t ? keptAt(t.kept, 1) : null, kl = lastKept(m.kept), klt = t && kl ? t.kept.find(function (k) { return k.lag_h === kl.lag_h; }) : null;
    let h = '<div class="eyebrow">The network of nuclei</div>';
    let s = "In an hour a cell keeps " + pc(k1) + " of its neighbours" + (kl && kl.lag_h > 1.5 ? ", in " + fmtH(kl.lag_h) + " " + pc(kl.kept) : "") + ". ";
    s += k1 !== null && k1 > 0.97 && (!kl || kl.kept > 0.9) ? "Each cell stays with the same neighbours: the sheet is solid. " : "Cells swap neighbours: the sheet flows. ";
    if (t) s += "As simulated: " + pc(k1t) + (klt ? ", " + pc(klt.kept) : "") + ".";
    h += '<p class="small" style="margin:0">' + s + '</p>';
    const ok = k1 !== null && k1t !== null && Math.abs(k1 - k1t) < 0.03;
    h += '<span class="chip ' + (ok ? "good" : "bad") + '">' + (ok ? "Neighbours as simulated" : "Simulated: " + pc(k1t)) + '</span>';
    if (level !== "curious") {
      const md = msdAt(m.msd, 1), mt = t ? msdAt(t.msd, 1) : null, dd = cache.res ? (function () { const r = cache.res; let b = null; r.taus_s.forEach(function (x, i) { if (r.msd[i] > 0 && (b === null || Math.abs(Math.log(x)) < Math.abs(Math.log(r.taus_s[b])))) b = i; }); return b !== null && Math.abs(Math.log(r.taus_s[b])) < 0.3 ? r.msd[b] : null; })() : null;
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Nuclei</dt><dd>' + fmtSig(m.n_detected, 3) + ' found per frame' + (t ? ' (' + t.n_cells + ' cells simulated; ' + pc(t.found_frac) + ' of the true nuclei found, within ' + fmtSig(t.loc_err_um, 2) + ' ' + MU + 'm rms)' : '') + '; each followed for ' + fmtSig(m.track_frames, 3) + ' frames on average</dd>';
      h += '<dt>Cells</dt><dd>' + pc(m.kept_frac) + ' of the nuclei have a complete Voronoi cell inside the field; mean shape index ' + fmtSig(m.p_mean, 3) + ' +- ' + fmtSig(m.p_sd, 2) + ' (simulated ' + (t ? fmtSig(t.p_mean, 3) : "-") + '), ' + pc(m.hex_frac) + ' hexagons (simulated ' + (t ? pc(t.hex_frac) : "-") + ')</dd>';
      h += '<dt>Displacement in 1 h</dt><dd>from the tracks, relative to the nuclei followed: ' + (md !== null ? fmtSig(md, 2) : "-") + ' ' + MU + 'm' + SQ + '; DDM, step 7: ' + (dd !== null ? fmtSig(dd, 2) : "-") + '; simulated: ' + (mt !== null ? fmtSig(mt, 2) : "-") + '</dd>';
      h += '</dl></details>';
    }
    el.innerHTML = h;
  }

  // ---- step 9: the motility sweep -----------------------------------------------------------------
  const T2 = 2;   // hours: the delay at which the sweep reads the displacement
  function at2(p) { let best = null; p.taus_s.forEach(function (t, i) { if (p.msd[i] > 0 && (best === null || Math.abs(Math.log(t / T2)) < Math.abs(Math.log(p.taus_s[best] / T2)))) best = i; }); return best !== null && Math.abs(Math.log(p.taus_s[best] / T2)) < 0.25 ? p.msd[best] : null; }
  function true2(p) { const m = p.truth.msd; let i = 0; while (i < m.lag_h.length - 1 && m.lag_h[i + 1] < T2) i++; return m.um2[Math.min(i + 1, m.um2.length - 1)]; }
  function takeSnapshot() {
    compare = { label: "the earlier run" };
    if (cache.res) {
      const res = cache.res; compare.msd = res.taus_s.map(function (t, i) { return [t, res.msd[i]]; });
      compare.curves = pickRows().map(function (r) { return { t: res.taus_s, f: r.f }; });
    }
  }
  function drawSeries() {
    const ok = seriesValid(), s = ok ? cache.series : null;
    $("series-figs").hidden = !ok;
    $("btn-series").textContent = ok ? "Run the sweep again" : cache.series ? "Run the sweep for these settings" : "Run the motility sweep";
    if (!ok) { $("series-state").textContent = cache.series ? "The settings changed since the last sweep: run it again to see these." : "Not run yet: about " + fmtDur(seriesSeconds()) + " for these settings."; return; }
    $("series-state").textContent = "";
    const pts = s.points, cell2 = state.cell_um * state.cell_um;
    const vals = []; pts.forEach(function (p) { const m = at2(p), t = true2(p); if (m > 0) vals.push(m); if (t > 0) vals.push(t); });
    const y0 = Math.max(0.05, Math.min.apply(null, vals.concat([1])) / 2), y1 = Math.max.apply(null, vals.concat([cell2])) * 2;
    const a = axes($("chart-sweep"), { xlog: true, ylog: true, x0: 2.5, x1: 40, y0: y0, y1: y1, xlabel: "How hard the cells crawl, v0 (" + MU + "m/h)", ylabel: "<\u0394r" + SQ + "> in " + T2 + " h (" + MU + "m" + SQ + ")" }), ctx = a.ctx;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(a.m.l, a.fy(0.1 * cell2)); ctx.lineTo(a.m.l + a.pw, a.fy(0.1 * cell2)); ctx.stroke(); ctx.setLineDash([]);
    SWEEP_J.forEach(function (J, k) {
      const col = J === 0 ? C.accent : C["accent-2"], ps = pts.filter(function (p) { return p.set.J_h === J; });
      poly(ctx, ps.map(function (p) { const t = true2(p); return t > 0 ? [a.fx(p.set.v0_um_h), a.fy(t)] : null; }), col, 1.6, [], 0.8);
      ps.forEach(function (p) {
        const X = a.fx(p.set.v0_um_h * (1 + (k ? 0.02 : -0.02))), m = at2(p);
        if (m > 0) dot(ctx, X, a.fy(m), 3.2, col, null);
        else if (p.msd_beyond) { const Y = a.fy(Math.min(y1 / 1.5, 0.15 * cell2)); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X - 4, Y); ctx.lineTo(X + 4, Y); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 12); ctx.moveTo(X - 3, Y - 8); ctx.lineTo(X, Y - 12); ctx.lineTo(X + 3, Y - 8); ctx.stroke(); }
      });
    });
    a.done();
    const b = axes($("chart-order"), { xlog: true, ylog: false, x0: 2.5, x1: 40, y0: 0, y1: 1.05, xlabel: "How hard the cells crawl, v0 (" + MU + "m/h)", ylabel: "Order \u03c8" }), cb = b.ctx;
    SWEEP_J.forEach(function (J) {
      const col = J === 0 ? C.accent : C["accent-2"], ps = pts.filter(function (p) { return p.set.J_h === J; });
      poly(cb, ps.map(function (p) { return [b.fx(p.set.v0_um_h), b.fy(p.truth.order)]; }), col, 1.6, [], 0.8);
      ps.forEach(function (p) { if (p.psi !== null) dot(cb, b.fx(p.set.v0_um_h), b.fy(p.psi), 3.2, col, null); });
    });
    b.done();
    const ck = $("chart-sweep-kept");
    if (ck) {
      const kv = pts.map(function (p) { return p.net && p.net.measured ? keptAt(p.net.measured.kept, T_KEPT) : null; }).concat(pts.map(function (p) { return p.net && p.net.truth ? keptAt(p.net.truth.kept, T_KEPT) : null; })).filter(function (v) { return v !== null; });
      const k0 = Math.max(0, Math.floor((Math.min.apply(null, kv.concat([0.9])) - 0.05) * 10) / 10);
      const e = axes(ck, { xlog: true, ylog: false, x0: 2.5, x1: 40, y0: k0, y1: 1 + 0.03 * (1 - k0), xlabel: "How hard the cells crawl, v0 (" + MU + "m/h)", ylabel: "Neighbours kept in " + T_KEPT + " h" }), ce = e.ctx;
      SWEEP_J.forEach(function (J, k) {
        const col = J === 0 ? C.accent : C["accent-2"], ps = pts.filter(function (p) { return p.set.J_h === J; });
        poly(ce, ps.map(function (p) { const v = p.net && p.net.truth ? keptAt(p.net.truth.kept, T_KEPT) : null; return v !== null ? [e.fx(p.set.v0_um_h), e.fy(v)] : null; }), col, 1.6, [], 0.8);
        ps.forEach(function (p) { const v = p.net && p.net.measured ? keptAt(p.net.measured.kept, T_KEPT) : null; if (v !== null) dot(ce, e.fx(p.set.v0_um_h * (1 + (k ? 0.02 : -0.02))), e.fy(v), 3.2, col, null); });
      });
      e.done();
    }
    $("sweep-legend").innerHTML = '<span><i style="background:' + C.accent + '"></i>No alignment</span><span><i style="background:' + C["accent-2"] + '"></i>Alignment, J = 2 per hour</span><span>Dots: measured; lines: as simulated; arrows: beyond what the patterns used can follow; dotted: a tenth of a cell area, the line between jammed and fluid</span>';
    const nk = function (p, w) { return p.net && p.net[w] ? keptAt(p.net[w].kept, T_KEPT) : null; }, np = function (p, w) { return p.net && p.net[w] ? p.net[w].p_mean : null; };
    fillNumbers("series-numbers", ["v0 (" + MU + "m/h)", "Alignment (1/h)", "<\u0394r" + SQ + "> in 2 h, measured", "simulated", "Order, measured", "simulated", "State found", "Neighbours kept in " + T_KEPT + " h, measured", "simulated", "Shape index, measured", "simulated"], pts.map(function (p) { return [p.set.v0_um_h, p.set.J_h, at2(p) || (p.msd_beyond ? "more" : null), true2(p), p.psi, p.truth.order, p.state, nk(p, "measured"), nk(p, "truth"), np(p, "measured"), np(p, "truth")]; }));
    const ul = $("sweep-notes"); ul.innerHTML = "";
    const add = function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); };
    const st = function (J) { return pts.filter(function (p) { return p.set.J_h === J; }).map(function (p) { return fmtSig(p.set.v0_um_h, 2) + ": " + p.state; }).join(", "); };
    add("States found without alignment: " + st(0) + ". With alignment: " + st(2) + ".");
    const far = pts.filter(function (p) { return !at2(p) && p.msd_beyond && nk(p, "measured") !== null; });
    if (far.length) add("Where the displacement is beyond what the patterns can follow (arrows), the network of nuclei still reads how fast cells swap neighbours: " + far.map(function (p) { return fmtSig(p.set.v0_um_h, 2) + (p.set.J_h ? " aligned" : "") + ": " + fmtSig(100 * nk(p, "measured"), 2) + " %"; }).join(", ") + " kept in " + T_KEPT + " h.");
  }

  // ---- result -------------------------------------------------------------------------------
  function trueState() {
    const t = cache.movie.truth, cell2 = state.cell_um * state.cell_um, m = t.msd, half = cache.res.taus_s[cache.res.taus_s.length - 1];
    let i = 0; while (i < m.lag_h.length - 1 && m.lag_h[i + 1] <= half) i++;
    const solid = m.um2[i] < 0.1 * cell2, flock = t.order > 0.5;
    return flock ? (solid ? "flocking solid" : "flocking liquid") : (solid ? "jammed" : "fluid");
  }
  const STATE_WORDS = { jammed: "Jammed", fluid: "Fluid", "flocking solid": "A flocking solid", "flocking liquid": "A flocking liquid" };
  function verdict() { const r = cache.res, ts = trueState(); return r.state === ts ? { cls: "good", text: "State as simulated" } : { cls: "bad", text: "Simulated: " + ts }; }
  function renderResult() {
    const res = cache.res, t = cache.movie.truth, v = verdict(), V = Math.hypot(res.V_um_h[0], res.V_um_h[1]), Vt = Math.hypot(t.drift_um_h[0], t.drift_um_h[1]), cell2 = state.cell_um * state.cell_um;
    let h = '<div class="eyebrow">Result</div>';
    h += '<div class="big">' + STATE_WORDS[res.state] + '</div>';
    const solidState = res.state === "jammed" || res.state === "flocking solid", reachHi = 9.2 / (res.band.q_lo * res.band.q_lo);
    // close to the line between solid and fluid (a tenth of a cell area), or the last reading near the top of the reach: the movie cannot decide
    const borderline = !res.msd_tiny && !res.msd_beyond && res.msd_last_um2 !== null && (Math.abs(Math.log(res.msd_last_um2 / (0.1 * cell2))) < Math.log(2) || res.msd_last_um2 > 0.7 * reachHi);
    h += '<p class="small" style="margin:0 0 0.4rem">' + (solidState ? "Solid-like over the " + fmtH(cache.movie.T * cache.movie.frame_h) + " of the movie and the distances its patterns probe: a longer movie could still see the cells move on." : "Fluid-like over the times and distances of this movie.") + ' A classification for this model and this movie, not a diagnosis of a real tissue.</p>';
    let s = "";
    if (res.msd_tiny) s += "Relative to their neighbours the cells move less than the patterns can show (" + fmtSig(Math.sqrt(res.msd_min_um2), 2) + " " + MU + "m) over the whole movie. ";
    else if (!res.msd_beyond) s += "Relative to the sheet a cell moves about " + fmtSig(Math.sqrt(res.msd_last_um2), 2) + " " + MU + "m in " + fmtH(res.msd_last_h) + ", " + fmtSig(Math.sqrt(res.msd_last_um2) / state.cell_um, 2) + " of its size" + (res.msd_last_um2 < 0.1 * cell2 ? ": it stays in the cage of its neighbours. " : ". ");
    else s += "Relative to the sheet the cells move more than the patterns used can follow, about " + fmtSig(Math.sqrt(res.msd_last_um2), 2) + " " + MU + "m, within " + fmtH(res.msd_last_h) + ": they squeeze past their neighbours. ";
    s += V > 3 * res.V_err_um_h ? "The whole sheet travels at " + fmtSig(V, 2) + " " + MU + "m/h" + (res.psi !== null ? ", order " + fmtSig(res.psi, 2) + "." : ".") : "The sheet as a whole does not travel (" + fmtSig(V, 2) + " +- " + fmtSig(res.V_err_um_h, 1) + " " + MU + "m/h).";
    h += '<p class="small" style="margin:0">' + s + ' As simulated: ' + trueState() + ', sheet at ' + fmtSig(Vt, 2) + ' ' + MU + 'm/h, order ' + fmtSig(t.order, 2) + '.</p>';
    h += '<span class="chip ' + v.cls + '">' + v.text + '</span>';
    if (borderline) h += ' <span class="chip warn">Close to the line between solid and fluid: this movie cannot decide</span>';
    h += '<p class="small" style="margin:0.4rem 0 0">Displacements are read from the patterns as if they were Gaussian: reliable from about ' + fmtSig(res.msd_min_um2, 2) + ' to ' + fmtSig(reachHi, 2) + ' ' + MU + 'm' + SQ + '; near the top of that range they read low in a flowing sheet, and beyond it the page gives only a lower bound.</p>';
    if (level !== "curious") {
      const at1 = function (taus, msd) { let b = null; taus.forEach(function (x, i) { if (msd[i] > 0 && (b === null || Math.abs(Math.log(x)) < Math.abs(Math.log(taus[b])))) b = i; }); return b !== null && Math.abs(Math.log(taus[b])) < 0.3 ? fmtSig(msd[b], 2) : "-"; };
      const row = function (cls, name, st, m1, vv, ps, note) { return '<tr class="' + cls + '"><th scope="row">' + name + (note ? '<span class="note">' + note + '</span>' : '') + '</th><td>' + st + '</td><td>' + m1 + '</td><td>' + vv + '</td><td>' + ps + '</td></tr>'; };
      let tb = '<div class="tscroll"><table class="sizing"><thead><tr><th scope="col">Method</th><th scope="col">State</th><th scope="col">&lt;&Delta;r&sup2;&gt; in 1 h (' + MU + 'm&sup2;)</th><th scope="col">Sheet velocity (' + MU + 'm/h)</th><th scope="col">Order</th></tr></thead><tbody>';
      tb += row("main", "This page", res.state, at1(res.taus_s, res.msd), fmtSig(V, 2) + " +- " + fmtSig(res.V_err_um_h, 1), res.psi !== null ? fmtSig(res.psi, 2) : "-", (res.comoving ? "relative to the sheet" : "as recorded") + (res.channel && res.channel !== "nuclei" ? ", on " + CHAN_WORDS[res.channel] : ""));
      if (level === "addict" && res.published) { const p = res.published; tb += p.failed ? row("pub", "Baseline (published steps, as implemented here)", "-", "-", "-", "-", "could not run") : row("pub", "Baseline (published steps, as implemented here)", p.state, at1(p.taus_s, p.msd), "-", "-", "in the frame of the microscope"); }
      tb += row("truth", "Simulation", trueState(), fmtSig(trueMsdAt(1), 2), fmtSig(Vt, 2), fmtSig(t.order, 2), "");
      h += tb + '</tbody></table></div>';
      h += '<details class="more"><summary>Details</summary><dl>';
      h += '<dt>Patterns used</dt><dd>q from ' + fmtSig(res.band.q_lo, 2) + ' to ' + fmtSig(res.band.q_hi, 2) + ' ' + MU + 'm' + MINUS1 + ' (the peak of A is at ' + fmtSig(res.band.q_peak, 2) + ', the spacing of neighbouring nuclei)</dd>';
      h += '<dt>Reach</dt><dd>displacements from about ' + fmtSig(res.msd_min_um2, 2) + ' to ' + fmtSig(9.2 / (res.band.q_lo * res.band.q_lo), 2) + ' ' + MU + 'm' + SQ + '</dd>';
      h += '<dt>Speed of a cell</dt><dd>' + (res.v_cell_um_h ? fmtSig(res.v_cell_um_h, 2) + ' ' + MU + 'm/h from the shortest delay measured (simulated mean speed ' + fmtSig(t.speed_um_h, 2) + ')' : 'too slow to read at the shortest delays') + '</dd>';
      h += '</dl></details>';
    }
    $("result").innerHTML = h + ampLine();
    $("hero-result").innerHTML = '<span>' + (level === "curious" ? "The sheet, as simulated" : "State, simulated") + '</span><span class="n">' + trueState() + '</span><span>Found by DDM</span><span class="n">' + res.state + '</span><span class="chip ' + v.cls + '">' + v.text + '</span>';
    $("hero-cap").textContent = "Simulated fluorescence time-lapse of " + (cache.shown.channel === "edges" ? "the cell edges (drawn from the nuclei)" : cache.shown.channel === "both" ? "the nuclei and the cell edges" : "the nuclei") + " of a monolayer, " + fmtH(cache.movie.T * cache.movie.frame_h) + " played in about " + fmtSig(cache.movie.T / 12, 2) + " s, field " + fmtSig(cache.movie.L_um, 3) + " " + MU + "m.";
  }
  function renderText() {
    const m = cache.movie, st = STATES[state.tstate];
    const ch = cache.shown.channel;
    $("movie-text").textContent = (ch === "edges" ? "The movie shows the edges of " : ch === "both" ? "The movie shows the nuclei and the edges of " : "The movie shows the nuclei of ") + m.truth.n_cells + " cells over " + fmtH(m.T * m.frame_h) + ", one frame every " + fmtSig(state.frame_min, 2) + " minutes. " + (st && st.v0_um_h !== undefined ? st.note : "The cells crawl at up to " + fmtSig(state.v0_um_h, 2) + " " + MU + "m/h" + (state.J_h > 0 ? " and steer towards where they are pushed." : ", each in its own direction."));
    $("movie-specs").innerHTML = "10x objective, pixel " + fmtSig(m.pixel_um, 3) + " " + MU + "m, " + m.n + " x " + m.n + " pixels, field " + fmtSig(m.L_um, 3) + " " + MU + "m. " + m.T + " frames, " + fmtSig(state.frame_min, 2) + " min apart. Nuclei as spots of rms radius 2.5 " + MU + "m, " + fmtSig(state.photons, 2) + " photons each per frame; simulation step " + fmtSig(60 * m.info.step_h, 2) + " min." +
      (ch ? " The cell edges are not filmed but drawn: in each frame the nuclei are found and their Voronoi network (step 8) is drawn as lines of rms width 1.5 " + MU + "m, with as much light per cell as a nucleus, " + (ch === "both" ? "added to the frame of the nuclei" : "on the same background") + ", with the shot noise and read noise of the camera." : "");
    $("diff-note").textContent = "Move the delay slider: in a jammed sheet the difference stays faint for hours; in a fluid or flocking one it is full of pairs of " + (ch === "edges" ? "dark and bright lines" : ch === "both" ? "dark and bright spots and lines" : "spots") + " within an hour.";
    const sb = $("movie-scale"), target = m.L_um / 4, nice = niceStep(target) > target ? niceStep(target) / 2 : niceStep(target);
    sb.querySelector("i").style.width = (100 * nice / m.L_um).toFixed(1) + "%"; sb.querySelector("span").textContent = fmtSig(nice, 2) + " " + MU + "m"; sb.style.width = "100%";
  }
  function renderSettings() {
    const res = cache.res, s = seriesValid() ? cache.series : null;
    const obj = { microscope: "Nikon Ti2-E, 10x, fluorescence", detector: "Hamamatsu ORCA-Flash4.0 V3, binned " + state.binning + " x " + state.binning, simulation: cache.cfg, analysis: cache.opts,
      result: { state: res.state, V_um_h: res.V_um_h.map(function (v) { return +v.toPrecision(3); }), psi: res.psi !== null ? +res.psi.toPrecision(3) : null, delays_h: res.taus_s.map(function (v) { return +v.toPrecision(3); }), msd_um2: res.msd.map(function (v) { return v ? +v.toPrecision(3) : null; }) },
      network: netBrief(),
      rates: (function () { const F = fitsFor(state.fit_model), sl = rateSlope(F); return { model: state.fit_model, slope: sl ? +sl.slope.toPrecision(3) : null, q_per_um: F.rows.map(function (r) { return +r.q_per_um.toPrecision(3); }), rate_per_h: F.meas.map(function (o) { return o && o.rate ? +o.rate.toPrecision(3) : null; }) }; })(),
      sweep: s ? s.points.map(function (p) { const k4 = p.net && p.net.measured ? keptAt(p.net.measured.kept, T_KEPT) : null; return { v0_um_h: p.set.v0_um_h, J_h: p.set.J_h, state: p.state, psi: p.psi !== null ? +p.psi.toPrecision(3) : null, neighbours_kept_4h: k4 !== null ? +k4.toPrecision(3) : null }; }) : null };
    $("settings-json").textContent = JSON.stringify(obj, null, 1).replace(/\[\s+([-\d.e+,\s\[\]nul]+?)\s+\]/g, function (m, a) { return "[" + a.replace(/\s+/g, " ") + "]"; });
    focusableScrollers();
  }
  function renderLag() { const res = cache.res, li = lagIndex(); $("lag").max = res.lags.length - 1; const t = fmtH(res.taus_s[li]) + " (" + res.lags[li] + (res.lags[li] === 1 ? " frame)" : " frames)"); $("lag-out").textContent = t; $("lag").setAttribute("aria-valuetext", t); }
  function renderAll() {
    if (!cache.res) return;
    readColors(); grey = greyRange(cache.shown); greyNuc = greyRange(cache.movie); diffScale = null;
    document.querySelectorAll(".frame-label").forEach(function (e) { e.textContent = cache.res.comoving ? "in the frame of the sheet" : "in the frame of the microscope (the motion of the sheet not taken out)"; });
    setQSpan(); renderLag(); renderText(); drawCell(); drawMovieFrames(); drawMap(); drawStripes(); renderGamma(); drawCurves(); drawMsd(); drawPath(); drawAmp(); renderResult(); renderNetwork(); drawSeries(); renderSettings();
  }

  // ---- "what matters" cards ---------------------------------------------------------------
  const CARDS = [
    { lvl: 1, title: "Jammed or fluid", text: "Crawling at 6 um/h, the cells of the standard sample stay in the cage of their neighbours: relative to them, a cell moves about 2 um in ten hours, and the patterns stall. At 30 um/h they squeeze past their neighbours and the patterns fade within an hour. In this model the sheet unjams between about 6 and 12 um/h; in real monolayers the threshold also depends on how stiff and how elongated the cells are.".replace(/um/g, MU + "m"),
      shows: [{ label: "Jammed", set: {}, go: "step-rates" }, { label: "Fluid", set: { tstate: "fluid", v0_um_h: 30 }, go: "step-rates" }, { label: "The sweep", set: {}, go: "step-series", series: true }] },
    { lvl: 1, title: "A flock can be solid", text: "With alignment, slow cells steer together and the whole sheet travels at about 7 um/h, yet each cell keeps its neighbours: a flocking solid. Faster cells travel together and flow at the same time: a flocking liquid. The colours of step 1 show it: one colour everywhere for a flock.".replace(/um/g, MU + "m"),
      shows: [{ label: "Flocking solid", set: { tstate: "flocksolid", v0_um_h: 8, J_h: 2 }, go: "step-setup" }, { label: "Flocking liquid", set: { tstate: "flockliquid", v0_um_h: 30, J_h: 2 }, go: "step-setup" }] },
    { lvl: 1, title: "Follow the sheet first", text: "In the frame of the microscope every nucleus of a flock travels tens of micrometres in a few hours, and the patterns fade as in a fluid. Whether the sheet is solid shows only relative to the sheet: the page finds the path of the whole sheet from the widest patterns and moves every frame back by it. At the Addict level this can be switched off.",
      shows: [{ label: "Flocking solid", set: { tstate: "flocksolid", v0_um_h: 8, J_h: 2 }, go: "step-rates" }] },
    { lvl: 2, title: "The patterns that tell", text: "The strongest patterns are those at the spacing of neighbouring nuclei, but there the arrangement of the cells slows the patterns down, as in a crowd of particles. The displacement is read a little above it, where each nucleus counts on its own, up to where the nuclei, blurred spots about 5 um across, fade into the noise. That band sets the reach: from a fraction of a micrometre to about 5 um. A higher magnification, or binning 2 x 2, moves the band to finer patterns and smaller displacements.".replace(/um/g, MU + "m"),
      shows: [{ label: "Binned 4 x 4", set: {}, go: "step-rates" }, { label: "Binned 2 x 2", set: { binning: 2 }, go: "step-rates" }] },
    { lvl: 2, title: "Nuclei, edges or both", text: "DDM does not need nuclei. The page can also run on the cell edges, drawn in each frame from the network of the nuclei as a stain of the membranes would show them, or on both together. The edges give the same state and the same velocity of the sheet. In a jammed sheet they read the displacement a little higher at short delays, 0.77 um2 in an hour against 0.63 from the nuclei (0.53 simulated): a corner of the network is set by three nuclei and moves more than each of them. With both stains the strongest patterns nearly vanish: the edges lie between the nuclei, so at the spacing of neighbours the two patterns are out of step and cancel, and the signal there falls about 25 times.".replace(/um2/g, MU + "m" + SQ),
      shows: [{ label: "Nuclei", set: {}, go: "step-rates" }, { label: "Edges", set: { channel: "edges" }, go: "step-rates" }, { label: "Both", set: { channel: "both" }, go: "step-rates" }] },
    { lvl: 2, title: "Time between frames", text: "Cells move slowly, so a frame every few minutes is enough, and a long movie matters more than a fast camera. A fluid sheet at 30 um/h needs frames a few minutes apart to catch the first steps; a jammed one shows its cage only over many hours.".replace(/um/g, MU + "m"),
      shows: [{ label: "1 min, fluid", set: { tstate: "fluid", v0_um_h: 30, frame_min: 1 }, go: "step-rates" }, { label: "15 min, jammed", set: { frame_min: 15 }, go: "step-rates" }] }
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
    if (set.tstate && STATES[set.tstate].v0_um_h !== undefined && set.v0_um_h === undefined) { state.v0_um_h = STATES[set.tstate].v0_um_h; state.J_h = STATES[set.tstate].J_h; }
    if (!set.tstate) state.tstate = matchState();
    state.seed = LEVEL_RANK[level] >= 3 ? keep : BASE.seed; state.sim_px = set.sim_px || sp;
    if (set.seed !== undefined) state.seed = set.seed;
    resetPredictions();
    constrain(); syncControls(); if (cache.res) drawSeries(); schedule();
  }
  let predicting = false;
  const PREDICT_BASE = { flock: function () { return state.J_h > 0 || state.v0_um_h > 10 ? { text: "This question starts from the jammed sheet; the bench now has something else.", set: {} } : null; } };
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
          takeSnapshot();
          predicting = true; state.J_h = 2; state.tstate = matchState(); constrain(); syncControls(); predicting = false;
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
  $("btn-reset").addEventListener("click", function () { compare = null; const keep = LEVEL_RANK[level] >= 3 ? state.seed : BASE.seed, sp = state.sim_px; state = Object.assign({}, BASE); state.seed = keep; state.sim_px = sp; resetPredictions(); constrain(); syncControls(); schedule(); });
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
  const redraw = function () { clearTimeout(rz); rz = setTimeout(function () { readColors(); if (cache.res) { drawCell(); drawCurves(); drawGamma(); drawMsd(); drawPath(); drawSeries(); drawAmp(); drawMapOverlay(); drawNet(); drawKept(); drawShape(); } }, 80); };
  new ResizeObserver(redraw).observe(document.querySelector(".steps"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  $("btn-series").addEventListener("click", function () { startSeries(); });
  document.querySelectorAll(".opt-show").forEach(function (b) { b.addEventListener("click", function () { b.closest(".step").classList.add("unfolded"); readColors(); if (cache.res) { renderGamma(); drawCurves(); renderNetwork(); } }); });
  $("fit-model").addEventListener("change", function () { state.fit_model = $("fit-model").value; if (cache.res) { renderGamma(); drawCurves(); renderSettings(); } });
  $("net-frame").addEventListener("input", function () { if (cache.movie) drawNet(); });
  $("net-colour").addEventListener("change", function () { if (cache.movie) drawNet(); });

  const PAGE_NAME = "tissues";
  function setupHash() {
    const q = [];
    Object.keys(BASE).forEach(function (k) { const v = state[k]; if (JSON.stringify(v) === JSON.stringify(BASE[k])) return; q.push(encodeURIComponent(k) + "=" + encodeURIComponent(v === null ? "null" : String(v))); });
    return "#" + level + (q.length ? "/" + q.join("&") : "");
  }
  const HASH_KEYS = { seed: 1, q_min: 1, q_max: 1, fit_model: 1 }; CONTROLS.forEach(function (c) { if (c.key) HASH_KEYS[c.key] = 1; });
  function parseHash(h) {
    const parts = String(h || "").replace(/^#/, "").split("/"), set = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      const i = kv.indexOf("="); if (i < 1) return;
      let k, raw; try { k = decodeURIComponent(kv.slice(0, i)); raw = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (!Object.prototype.hasOwnProperty.call(BASE, k) || !HASH_KEYS[k]) return;
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
  function movieName() { const mv = cache.shown; return "ddm-" + PAGE_NAME + "-" + state.tstate + (mv.channel ? "-" + mv.channel : "") + "-" + mv.n + "x" + mv.n + "x" + mv.T; }
  $("btn-tiff").addEventListener("click", function () {
    const mv = cache.shown; if (!mv || !mv.frames) return;
    DDM_TIFF.save(movieName() + ".tif", DDM_TIFF.tiff(mv.frames, mv.n, mv.T, mv.pixel_um, mv.frame_h * 3600, "info=Simulated on rcerbino.github.io/ddm, photoelectrons per pixel; one frame every " + state.frame_min + " min"), "image/tiff");
  });

  const p0 = parseHash(location.hash);
  setLevel(p0.level || "curious", false);
  if (!applySetup(p0)) schedule();
  requestAnimationFrame(tick);
  window.DDM_PAGE = {
    preset: applyPreset, state: function () { return JSON.parse(JSON.stringify(state)); }, series: startSeries,
    controls: function () { return CONTROLS.filter(function (c) { return c.kind !== "qrange" && (!c.when || c.when()); }).map(function (c) { return { key: c.key, kind: c.kind, lvl: c.lvl, min: c.min, max: c.max, options: c.kind === "select" ? c.options.map(function (o) { return o[0]; }) : null }; }); },
    truth: function () { return cache && cache.movie ? cache.movie.truth : null; },
    cfg: function () { return cache && cache.cfg ? JSON.parse(JSON.stringify(cache.cfg)) : null; },
    result: function () { const r = cache && cache.res; if (!r) return null; const s = seriesValid() ? cache.series : null; return { state: r.state, true_state: trueState(), V: r.V_um_h, psi: r.psi, msd: r.msd, taus: r.taus_s, verdict: verdict().text, published: r.published || null, network: netBrief(), rates: (function () { const F = fitsFor(state.fit_model), sl = rateSlope(F); return { model: state.fit_model, slope: sl ? sl.slope : null, measured: F.meas.filter(function (o) { return o && o.measured; }).length, fitted: F.meas.length }; })(), series: s ? s.points.map(function (p) { return { set: p.set, state: p.state, psi: p.psi }; }) : null }; }
  };
})();
