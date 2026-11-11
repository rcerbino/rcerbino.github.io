/* Background worker of the swimmers page: simulate the movie and analyse it (ACTIVE), keep the movie for re-analysis. */
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
    if (m.type === "repeat") {
      // new movies with the same settings and other seeds (the cached movie is kept for re-analysis)
      try {
        const N = m.seeds.length;
        for (let k = 0; k < N; k++) {
          const mv = drive(MOVIE.simulate(Object.assign({}, m.cfg, { seed: m.seeds[k] })), m.token, k / N, (k + 0.85) / N);
          const r = drive(ACTIVE.analyse(mv, m.opts), m.token, (k + 0.85) / N, (k + 1) / N);
          self.postMessage({ type: "repeat-run", token: m.token, run: ACTIVE.summary(r, mv) });
        }
        self.postMessage({ type: "repeat-done", token: m.token });
      } catch (e) { self.postMessage({ type: "error", token: m.token, message: e.message }); }
      return;
    }
    try {
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = drive(MOVIE.simulate(m.cfg), m.token, 0, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz,
          T_C: movie.T_C, viscosity_Pa_s: movie.viscosity_Pa_s, q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, times_s: movie.times_s, info: movie.info, truth: movie.truth };
      }
      const res = drive(ACTIVE.analyse(movie, m.opts), m.token, 0.85, 1);
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
