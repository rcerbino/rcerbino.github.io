/* Background worker of the microrheology page: simulate the movie and analyse it (RHEO), keep the movie for re-analysis. */
(function () {
  "use strict";
  let movie = null;
  function drive(gen, token, a, b) {
    let r, last = -1;
    while (!(r = gen.next()).done) {
      const f = a + (b - a) * r.value.frac;
      if (f - last > 0.01) { self.postMessage({ type: "progress", token: token, frac: f, stage: r.value.stage }); last = f; }
    }
    return r.value;
  }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = null;     // the worker now lives on between runs: let the old movie go before the new one is made
        movie = drive(MOVIE.simulate(m.cfg), m.token, 0, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz,
          T_C: movie.T_C, viscosity_Pa_s: movie.viscosity_Pa_s, q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, times_s: movie.times_s, info: movie.info, truth: movie.truth };
      }
      const res = drive(RHEO.analyse(movie, m.opts), m.token, 0.85, m.opts.compare_published ? 0.93 : 1);
      // the plain method on the same movie ("Addict" level); it may find too little to work with
      if (m.opts.compare_published) { try { res.published = RHEO.publishedSummary(drive(RHEO.analyse(movie, Object.assign({}, m.opts, { published_only: true })), m.token, 0.93, 1)); } catch (e) { res.published = { failed: e.message }; } }
      // copies: the engine keeps the structure function of this movie for the next analysis
      res.d2d = res.d2d.map(function (a) { return a.slice(); });
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
