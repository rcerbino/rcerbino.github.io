/* Background worker of the crowded-particles page: simulate the movie and a dilute reference of the same particles, analyse
   (CROWD), keep both for re-analysis. */
(function () {
  "use strict";
  let movie = null, refMovie = null, refAmp = {}, refKey = null;
  function drive(gen, token, a, b, pre) {
    let r, last = -1;
    while (!(r = gen.next()).done) {
      const f = a + (b - a) * r.value.frac;
      if (f - last > 0.01) { self.postMessage({ type: "progress", token: token, frac: f, stage: pre ? pre + r.value.stage.charAt(0).toLowerCase() + r.value.stage.slice(1) : r.value.stage }); last = f; }
    }
    return r.value;
  }
  self.onmessage = function (ev) {
    const m = ev.data;
    try {
      let out = null;
      if (m.type === "simulate" || !movie) {
        movie = null;     // the worker now lives on between runs: let the old movie go before the new one is made
        movie = drive(MOVIE.simulate(m.cfg), m.token, 0, 0.75);
        // the reference does not depend on how crowded the sample is or how the particles push: kept while its own settings stay
        const rc = CROWD.referenceConfig(m.cfg, movie.truth.interact.tau_B_s), rk = JSON.stringify(rc);
        if (rk !== refKey) { refKey = null; refMovie = drive(MOVIE.simulate(rc), m.token, 0.75, 0.82, "Dilute reference movie: "); refAmp = {}; refKey = rk; }
        out = { n: movie.n, T: movie.T, frames: movie.frames.slice(0), pixel_um: movie.pixel_um, L_um: movie.L_um, frame_rate_hz: movie.frame_rate_hz,
          T_C: movie.T_C, viscosity_Pa_s: movie.viscosity_Pa_s, q_opt_per_um: movie.q_opt_per_um, q_signal_max_per_um: movie.q_signal_max_per_um, times_s: movie.times_s, info: movie.info, truth: movie.truth };
      }
      // the reference amplitude, analysed the same way as the movie (with or without the window)
      const wk = m.opts.windowing ? "w" : "n";
      if (!refAmp[wk]) refAmp[wk] = drive(CROWD.referenceAmplitude(refMovie, { windowing: !!m.opts.windowing }), m.token, 0.82, 0.85, "Dilute reference movie: ");
      const ref = refAmp[wk];
      const o2 = Object.assign({}, m.opts, { reference: ref, n_labelled: movie.truth.interact.n_labelled, D0_um2_s: movie.truth.interact.D0_um2_s });
      const res = drive(CROWD.analyse(movie, o2), m.token, 0.85, m.opts.compare_published ? 0.93 : 1);
      // the published method on the same movie ("Addict" level); it may find too little to work with
      if (m.opts.compare_published) { try { res.published = CROWD.publishedSummary(drive(CROWD.analyse(movie, Object.assign({}, o2, { published_only: true })), m.token, 0.93, 1)); } catch (e) { res.published = { failed: e.message }; } }
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
