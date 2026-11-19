/* Background worker of the moving-tissues page: simulate the movie, find the network of nuclei (TISSUE_VORONOI) and
   analyse it with DDM (TISSUE_ENGINE) as the images asked: the nuclei, the cell edges drawn from them, or both
   (TISSUE_VORONOI.channelMovie). The movie and the images drawn from it are kept for re-analysis; the motility sweep runs a
   new movie at each setting and keeps only the summaries. */
(function () {
  "use strict";
  let movie = null, views = {};
  function drive(gen, token, a, b, pre) {
    let r, last = -1;
    while (!(r = gen.next()).done) {
      const f = a + (b - a) * r.value.frac;
      if (f - last > 0.01) { self.postMessage({ type: "progress", token: token, frac: f, stage: (pre || "") + r.value.stage }); last = f; }
    }
    return r.value;
  }
  function pubSummary(r) { return { msd: r.msd, taus_s: r.taus_s, state: r.state, psi: r.psi, V_um_h: r.V_um_h }; }
  function netSummary(n) { const s = function (x) { return x ? { p_mean: x.p_mean, hex_frac: x.hex_frac, kept: x.kept } : null; }; return { measured: s(n.measured), truth: s(n.truth) }; }
  // the images DDM analyses
  function viewOf(mv, cfg, ch, store, token, a, b, pre) {
    if (!ch || ch === "nuclei") return mv;
    if (store && store[ch]) return store[ch];
    const v = drive(TISSUE_VORONOI.channelMovie(mv, ch, cfg), token, a, b, pre);
    if (store) store[ch] = v;
    return v;
  }
  function lean(truth) { const t = Object.assign({}, truth); delete t.positions; return t; }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      if (m.type === "series") {
        const pts = [];
        m.list.forEach(function (g, i) {
          const a = i / m.list.length, b = (i + 1) / m.list.length, pre = "Run " + (i + 1) + " of " + m.list.length + ": ";
          const mv = drive(TISSUE_MOVIE.simulate(m.cfgs[i]), m.token, a, a + 0.75 * (b - a), pre);
          const net = drive(TISSUE_VORONOI.analyse(mv, { spacing_um: m.cfgs[i].cell_um }), m.token, a + 0.75 * (b - a), a + 0.85 * (b - a), pre);
          const vw = viewOf(mv, m.cfgs[i], m.opts.channel, null, m.token, a + 0.85 * (b - a), a + 0.9 * (b - a), pre);
          const r = drive(TISSUE_ENGINE.analyse(vw, m.opts), m.token, a + 0.9 * (b - a), m.opts.compare_published ? a + 0.95 * (b - a) : b, pre);
          const p = { set: g, msd: r.msd, taus_s: r.taus_s, msd_beyond: r.msd_beyond, msd_min_um2: r.msd_min_um2, psi: r.psi, V_um_h: r.V_um_h, state: r.state, net: netSummary(net), truth: { msd: mv.truth.msd, order: mv.truth.order, drift_um_h: mv.truth.drift_um_h } };
          if (m.opts.compare_published) { try { p.published = pubSummary(drive(TISSUE_ENGINE.analyse(vw, Object.assign({}, m.opts, { published_only: true })), m.token, a + 0.95 * (b - a), b, pre)); } catch (e) { p.published = { failed: e.message }; } }
          pts.push(p);
        });
        self.postMessage({ type: "series", token: m.token, points: pts });
        return;
      }
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = null; views = {};     // let the old movie go before the new one is made
        movie = drive(TISSUE_MOVIE.simulate(m.cfg), m.token, 0, 0.75);
        const net = drive(TISSUE_VORONOI.analyse(movie, { spacing_um: m.cfg.cell_um }), m.token, 0.75, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz, frame_h: movie.frame_h,
          q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, info: movie.info, truth: lean(movie.truth), net: net };
      }
      const ch = m.opts.channel || "nuclei", vw = viewOf(movie, m.cfg, ch, views, m.token, 0.85, 0.9);
      const res = drive(TISSUE_ENGINE.analyse(vw, m.opts), m.token, 0.9, m.opts.compare_published ? 0.95 : 1);
      if (m.opts.compare_published) { try { res.published = pubSummary(drive(TISSUE_ENGINE.analyse(vw, Object.assign({}, m.opts, { published_only: true })), m.token, 0.95, 1)); } catch (e) { res.published = { failed: e.message }; } }
      res.channel = ch;
      // the simulated cells' own decay at every q, for the rates of step 6
      if (movie.truth.positions) res.truthFs = TISSUE_RATES.truthFs(movie.truth.positions, movie.T, movie.L_um, movie.frame_h, res.lags, res.rows.map(function (r) { return r.q_per_um; }));
      res.d2d = res.d2d.map(function (a) { return a.slice(); }); res.d2d_lab = null;
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      const view = ch === "nuclei" ? null : { channel: ch, frames: vw.frames.slice(0) };
      if (view) transfer.push(view.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, view: view, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
