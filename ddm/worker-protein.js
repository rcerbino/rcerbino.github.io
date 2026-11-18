/* Background worker of the proteins page: simulate movies of a protein solution (FIELD), analyse them (PROTEIN_ENGINE),
   and run a concentration series. The movies of the bench are kept for re-analysis. */
(function () {
  "use strict";
  let movies = null;
  function drive(gen, token, a, b, pre) {
    let r, last = -1;
    while (!(r = gen.next()).done) {
      const f = a + (b - a) * r.value.frac;
      if (f - last > 0.01) { self.postMessage({ type: "progress", token: token, frac: f, stage: pre ? pre + r.value.stage.charAt(0).toLowerCase() + r.value.stage.slice(1) : r.value.stage }); last = f; }
    }
    return r.value;
  }
  // R movies of the same sample (seeds apart), then one analysis of all of them
  function runSample(cfg, R, opts, token, a, b, pre) {
    const mv = [];
    for (let k = 0; k < R; k++) mv.push(drive(FIELD.simulate(Object.assign({}, cfg, { seed: cfg.seed + 7919 * k })), token, a + (b - a) * 0.7 * k / R, a + (b - a) * 0.7 * (k + 1) / R, (pre || "") + (R > 1 ? "Movie " + (k + 1) + " of " + R + ": " : "")));
    const res = drive(PROTEIN_ENGINE.analyse(mv, opts), token, a + (b - a) * 0.7, b, pre);
    return { movies: mv, res: res };
  }
  // what the page needs of an analysis (the per-q data kept for the amplitude pass stay in the worker)
  function slim(res) {
    const r = Object.assign({}, res);
    r.rows = res.rows.map(function (x) { const o = Object.assign({}, x); delete o._y; delete o._wt; delete o._yj; delete o._dw; return o; });
    r.d2d = res.d2d.map(function (a) { return a.slice(); });
    return r;
  }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      if (m.type === "series") {
        // each concentration: R new movies and their analysis; then the lines, and the amplitudes again at the D of the line
        const pts = [], kept = [];
        for (let i = 0; i < m.list.length; i++) {
          const c = m.list[i], cfg = m.cfgs[i];
          const s = runSample(cfg, m.R, m.opts, m.token, i / m.list.length, (i + 1) / m.list.length, c + " mg/mL: ");
          const tA = s.movies[0].truth.amplitude, ar = s.res.rows.filter(function (x) { return x.q_per_um >= s.res.amp_q[0] && x.q_per_um <= s.res.amp_q[1] && x.A !== undefined; });
          const At = ar.length ? ar.reduce(function (p, x) { return p + tA.A[x.b]; }, 0) / ar.length : null;
          pts.push({ c: c, D: s.res.D_um2_s, D_rel_err: s.res.D_rel_err, A: s.res.A_mean, A_rel_err: s.res.A_rel_err, A_true: At, n_used: s.res.rows.filter(function (x) { return x.used; }).length });
          kept.push(s.res);
        }
        let fit = PROTEIN_ENGINE.series(pts, m.M, m.T_C, m.eta);
        if (fit.lineD && !m.opts.published_only) {
          pts.forEach(function (p, i) { const a = PROTEIN_ENGINE.amplitudeAt(kept[i], fit.lineD.a + fit.lineD.b * p.c); if (a) { p.A = a.A; p.A_rel_err = a.rel_err; } });
          fit = PROTEIN_ENGINE.series(pts, m.M, m.T_C, m.eta);
        }
        self.postMessage({ type: "series", token: m.token, points: pts, fit: fit });
        return;
      }
      let out = null;
      if (m.type === "simulate" || !movies) {
        movies = null;
        const s = runSample(m.cfg, m.R, m.opts, m.token, 0, 1);
        movies = s.movies;
        const mv = movies[0];
        out = { n: mv.n, T: mv.T, frames: mv.frames.slice(0), pixel_um: mv.pixel_um, L_um: mv.L_um, frame_rate_hz: mv.frame_rate_hz, exposure_s: mv.exposure_s,
          T_C: mv.T_C, viscosity_Pa_s: mv.viscosity_Pa_s, q_opt_per_um: mv.q_opt_per_um, q_signal_max_per_um: mv.q_signal_max_per_um, info: mv.info, truth: mv.truth, repeats: movies.length };
        const res = slim(s.res);
        self.postMessage({ type: "done", token: m.token, movie: out, res: res }, res.d2d.map(function (a) { return a.buffer; }).concat([out.frames.buffer]));
        return;
      }
      const res = slim(drive(PROTEIN_ENGINE.analyse(movies, m.opts), m.token, 0, 1));
      self.postMessage({ type: "done", token: m.token, movie: null, res: res }, res.d2d.map(function (a) { return a.buffer; }));
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
