/* Background worker of the crowded-particles page: simulate the movie and a dilute reference of the same particles, analyse
   (CROWD), keep both for re-analysis. */
(function () {
  "use strict";
  let movie = null, ref = null;
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
        movie = drive(MOVIE.simulate(m.cfg), m.token, 0, 0.75);
        const rv = drive(MOVIE.simulate(CROWD.referenceConfig(m.cfg, movie.truth.interact.tau_B_s)), m.token, 0.75, 0.82);
        ref = drive(CROWD.referenceAmplitude(rv), m.token, 0.82, 0.85);
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz,
          T_C: movie.T_C, viscosity_Pa_s: movie.viscosity_Pa_s, q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, times_s: movie.times_s, info: movie.info, truth: movie.truth };
      }
      const o2 = Object.assign({}, m.opts, { reference: ref, n_labelled: movie.truth.interact.n_labelled, D0_um2_s: movie.truth.interact.D0_um2_s });
      const res = drive(CROWD.analyse(movie, o2), m.token, 0.85, m.opts.compare_published ? 0.93 : 1);
      // the published method on the same movie ("Addict" level); it may find too little to work with
      if (m.opts.compare_published) { try { res.published = CROWD.publishedSummary(drive(CROWD.analyse(movie, Object.assign({}, o2, { published_only: true })), m.token, 0.93, 1)); } catch (e) { res.published = { failed: e.message }; } }
      const transfer = res.d2d.map(function (a) { return a.buffer; });
      if (out) transfer.push(out.frames.buffer);
      self.postMessage({ type: "done", token: m.token, movie: out, res: res }, transfer);
    } catch (e) {
      self.postMessage({ type: "error", token: m.token, message: e.message });
    }
  };
})();
