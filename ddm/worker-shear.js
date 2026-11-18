/* Background worker of the sheared-materials page: simulate the movie and analyse it (echo-DDM), keep the movie for
   re-analysis; the strain sweep runs a new movie at each strain amplitude and keeps only the diffusion coefficients. */
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
  function pubSummary(r) { return { flow: r.flow, vort: r.vort }; }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      if (m.type === "series") {
        const pts = [];
        m.list.forEach(function (g, i) {
          const a = i / m.list.length, b = (i + 1) / m.list.length, pre = "Strain " + Math.round(100 * g) + " %: ";
          const mv = drive(MOVIE.simulate(m.cfgs[i]), m.token, a, a + 0.85 * (b - a), pre);
          const r = drive(SHEAR_ENGINE.analyse(mv, m.opts), m.token, a + 0.85 * (b - a), m.opts.compare_published ? a + 0.93 * (b - a) : b, pre);
          const p = { strain: g, flow: r.flow, vort: r.vort, truth: mv.truth.shear };
          if (m.opts.compare_published) { try { p.published = pubSummary(drive(SHEAR_ENGINE.analyse(mv, Object.assign({}, m.opts, { published_only: true })), m.token, a + 0.93 * (b - a), b, pre)); } catch (e) { p.published = { failed: e.message }; } }
          pts.push(p);
        });
        self.postMessage({ type: "series", token: m.token, points: pts });
        return;
      }
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = null;     // let the old movie go before the new one is made
        movie = drive(MOVIE.simulate(m.cfg), m.token, 0, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz, exposure_s: movie.exposure_s,
          T_C: movie.T_C, viscosity_Pa_s: movie.viscosity_Pa_s, q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, times_s: movie.times_s, info: movie.info, truth: movie.truth };
      }
      const res = drive(SHEAR_ENGINE.analyse(movie, m.opts), m.token, 0.85, m.opts.compare_published ? 0.93 : 1);
      if (m.opts.compare_published) { try { res.published = pubSummary(drive(SHEAR_ENGINE.analyse(movie, Object.assign({}, m.opts, { published_only: true })), m.token, 0.93, 1)); } catch (e) { res.published = { failed: e.message }; } }
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
