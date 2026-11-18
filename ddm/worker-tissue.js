/* Background worker of the moving-tissues page: simulate the movie and analyse it (TISSUE_ENGINE), keep the movie for
   re-analysis; the motility sweep runs a new movie at each setting and keeps only the diffusion coefficients. */
(function () {
  "use strict";
  let movie = null;
  function drive(gen, token, a, b, pre) {
    let r, last = -1;
    while (!(r = gen.next()).done) {
      const f = a + (b - a) * r.value.frac;
      if (f - last > 0.01) { self.postMessage({ type: "progress", token: token, frac: f, stage: (pre || "") + r.value.stage }); last = f; }
    }
    return r.value;
  }
  function pubSummary(r) { return { msd: r.msd, taus_s: r.taus_s, state: r.state, psi: r.psi, V_um_h: r.V_um_h }; }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      if (m.type === "series") {
        const pts = [];
        m.list.forEach(function (g, i) {
          const a = i / m.list.length, b = (i + 1) / m.list.length, pre = "Run " + (i + 1) + " of " + m.list.length + ": ";
          const mv = drive(TISSUE_MOVIE.simulate(m.cfgs[i]), m.token, a, a + 0.85 * (b - a), pre);
          const r = drive(TISSUE_ENGINE.analyse(mv, m.opts), m.token, a + 0.85 * (b - a), m.opts.compare_published ? a + 0.93 * (b - a) : b, pre);
          const p = { set: g, msd: r.msd, taus_s: r.taus_s, msd_beyond: r.msd_beyond, msd_min_um2: r.msd_min_um2, psi: r.psi, V_um_h: r.V_um_h, state: r.state, truth: { msd: mv.truth.msd, order: mv.truth.order, drift_um_h: mv.truth.drift_um_h } };
          if (m.opts.compare_published) { try { p.published = pubSummary(drive(TISSUE_ENGINE.analyse(mv, Object.assign({}, m.opts, { published_only: true })), m.token, a + 0.93 * (b - a), b, pre)); } catch (e) { p.published = { failed: e.message }; } }
          pts.push(p);
        });
        self.postMessage({ type: "series", token: m.token, points: pts });
        return;
      }
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = null;     // let the old movie go before the new one is made
        movie = drive(TISSUE_MOVIE.simulate(m.cfg), m.token, 0, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz, frame_h: movie.frame_h,
          q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, info: movie.info, truth: movie.truth };
      }
      const res = drive(TISSUE_ENGINE.analyse(movie, m.opts), m.token, 0.85, m.opts.compare_published ? 0.93 : 1);
      if (m.opts.compare_published) { try { res.published = pubSummary(drive(TISSUE_ENGINE.analyse(movie, Object.assign({}, m.opts, { published_only: true })), m.token, 0.93, 1)); } catch (e) { res.published = { failed: e.message }; } }
      res.d2d = res.d2d.map(function (a) { return a.slice(); }); res.d2d_lab = null;
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
