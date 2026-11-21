/* The rate of each pattern: the classical result of a DDM analysis. At each q the curve f(q, dt) = 1 - (d - B) / A of
 * step 5 is fitted with a model, and the rate Gamma(q) (the inverse of the time at which the model falls to 1/e) is
 * plotted against q.
 *
 * Models (each reduced to a scan over its shape parameter and, for each shape, a one-dimensional search of the rate):
 *   exp    f = exp(-Gamma t)                                   simple diffusion: Gamma = D q^2
 *   kww    f = exp(-(Gamma t)^beta), beta 0.3 to 2              stretched (beta < 1: a spread of rates) or compressed
 *                                                               (beta > 1: persistent, ballistic-like motion)
 *   prw    f = exp(-q^2 <dr^2>(t) / 4), <dr^2> = 4 D (t - tp (1 - exp(-t / tp)))
 *                                                               persistent random walk (a cell keeps its direction for tp,
 *                                                               then wanders): ballistic, then diffusive
 *   cage   f = c + (1 - c) exp(-Gamma t)                       each cell rattles in the cage of its neighbours and the
 *                                                               curve stops at a plateau c
 *   dexp   f = (1 - c) exp(-Gamma1 t) + c exp(-Gamma2 t)       two decays: a fast rattle and a slow escape
 * Gamma is the rate at which the model reaches 1/e; for cage it is the rate of the decaying part (the plateau may stay
 * above 1/e), for dexp the slow rate when c > 1/e, else the time of 1/e.
 * A rate is "measured" when the fitted model has fallen below 0.8 by the longest delay and was above 0.2 at the
 * shortest one: otherwise the curve hardly moved (or had already gone) within the movie, and the rate is a bound.
 *
 * Truth: the self part of the intermediate scattering function of the simulated cells, F_s(q, dt) = <J0(q |dr|)> (the
 * average of cos(q . dr) over directions), with dr the displacement relative to the centre of mass of the sheet;
 * fitted with the same model. Where neighbours matter (near and below the peak of A) the patterns measure the motion of
 * the crowd, not of single cells, and need not follow it.
 */
(function (root) {
  "use strict";
  const LN = Math.log;
  // Bessel J0 (Numerical Recipes, error below 1e-8)
  function J0(x) {
    const ax = Math.abs(x);
    if (ax < 8) {
      const y = x * x;
      return (57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * (-184.9052456)))))) /
        (57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y)))));
    }
    const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
    const p1 = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
    const p2 = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
    return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
  }
  // minimum of g over log10 x in [lo, hi]: coarse scan, then golden section
  function minLog(g, lo, hi) {
    let best = lo, bv = Infinity;
    for (let k = 0; k <= 40; k++) { const x = lo + (hi - lo) * k / 40, v = g(Math.pow(10, x)); if (v < bv) { bv = v; best = x; } }
    let a = Math.max(lo, best - (hi - lo) / 40), b = Math.min(hi, best + (hi - lo) / 40);
    const R = 0.6180339887;
    let c = b - R * (b - a), d = a + R * (b - a), fc = g(Math.pow(10, c)), fd = g(Math.pow(10, d));
    for (let it = 0; it < 40; it++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - R * (b - a); fc = g(Math.pow(10, c)); }
      else { a = c; c = d; fc = fd; d = a + R * (b - a); fd = g(Math.pow(10, d)); }
    }
    const x = fc < fd ? c : d;
    return { x: Math.pow(10, x), v: Math.min(fc, fd) };
  }
  function sse(t, f, model) { let s = 0; for (let i = 0; i < t.length; i++) { const r = f[i] - model(t[i]); s += r * r; } return s; }
  // time at which a decreasing model reaches 1/e (bisection in log t), or null
  function tOfE(model, tLo, tHi) {
    const E = Math.exp(-1);
    let a = LN(tLo) - 7, b = LN(tHi) + 7;
    if (model(Math.exp(a)) < E || model(Math.exp(b)) > E) return null;
    for (let i = 0; i < 60; i++) { const m = 0.5 * (a + b); if (model(Math.exp(m)) > E) a = m; else b = m; }
    return Math.exp(0.5 * (a + b));
  }

  const MODELS = {
    exp: { label: "Exponential", n: 1 },
    kww: { label: "Stretched or compressed exponential", n: 2 },
    prw: { label: "Persistent random walk", n: 2 },
    cage: { label: "Exponential to a plateau (cage)", n: 2 },
    dexp: { label: "Two exponentials", n: 3 }
  };

  // one curve: t (delays), f (values; non-finite ones are left out), q (1/um), the model name
  function fitCurve(t0, f0, q, name) {
    const t = [], f = [];
    for (let i = 0; i < t0.length; i++) if (Number.isFinite(f0[i]) && t0[i] > 0) { t.push(t0[i]); f.push(f0[i]); }
    if (t.length < 4) return null;
    const tMin = t[0], tMax = t[t.length - 1], gLo = Math.log10(0.01 / tMax), gHi = Math.log10(100 / tMin);
    let best = null;
    const keep = function (v, p, model) { if (!best || v < best.v) best = { v: v, p: p, model: model }; };
    if (name === "exp") {
      const r = minLog(function (G) { return sse(t, f, function (x) { return Math.exp(-G * x); }); }, gLo, gHi);
      keep(r.v, { G: r.x }, function (x) { return Math.exp(-r.x * x); });
    } else if (name === "kww") {
      for (let beta = 0.3; beta <= 2.0001; beta += 0.05) {
        const bb = beta, r = minLog(function (G) { return sse(t, f, function (x) { return Math.exp(-Math.pow(G * x, bb)); }); }, gLo, gHi);
        keep(r.v, { G: r.x, beta: bb }, function (x) { return Math.exp(-Math.pow(r.x * x, bb)); });
      }
    } else if (name === "prw") {
      const q2 = q * q;
      for (let k = 0; k <= 30; k++) {
        const tp = tMin / 10 * Math.pow(10 * tMax / (tMin / 10), k / 30);
        const g = function (x) { return x - tp * (1 - Math.exp(-x / tp)); };
        const r = minLog(function (D) { return sse(t, f, function (x) { return Math.exp(-q2 * D * g(x)); }); }, Math.log10(1e-4 / q2 / tMax), Math.log10(1e4 / q2 / tMin));
        keep(r.v, { D: r.x, tp: tp }, function (x) { return Math.exp(-q2 * r.x * g(x)); });
      }
    } else if (name === "cage") {
      // for each rate the plateau is linear: f - e = c (1 - e)
      const plat = function (G) { let sn = 0, sd = 0; for (let i = 0; i < t.length; i++) { const e = Math.exp(-G * t[i]); sn += (f[i] - e) * (1 - e); sd += (1 - e) * (1 - e); } return sd > 0 ? Math.max(0, Math.min(1, sn / sd)) : 0; };
      const r = minLog(function (G) { const c = plat(G); return sse(t, f, function (x) { return c + (1 - c) * Math.exp(-G * x); }); }, gLo, gHi);
      const c = plat(r.x);
      keep(r.v, { G: r.x, c: c }, function (x) { return c + (1 - c) * Math.exp(-r.x * x); });
    } else if (name === "dexp") {
      // fast rate G1 on a grid, slow rate G2 searched, weight c linear
      for (let k = 0; k <= 24; k++) {
        const G1 = Math.pow(10, gLo + (gHi - gLo) * k / 24);
        const wgt = function (G2) { let sn = 0, sd = 0; for (let i = 0; i < t.length; i++) { const a = Math.exp(-G1 * t[i]), b = Math.exp(-G2 * t[i]); sn += (f[i] - a) * (b - a); sd += (b - a) * (b - a); } return sd > 0 ? Math.max(0, Math.min(1, sn / sd)) : 0; };
        const r = minLog(function (G2) { if (G2 >= G1) return Infinity; const c = wgt(G2); return sse(t, f, function (x) { return (1 - c) * Math.exp(-G1 * x) + c * Math.exp(-G2 * x); }); }, gLo, Math.log10(G1));
        if (!Number.isFinite(r.v)) continue;
        const c = wgt(r.x), G2 = r.x;
        keep(r.v, { G1: G1, G2: G2, c: c }, function (x) { return (1 - c) * Math.exp(-G1 * x) + c * Math.exp(-G2 * x); });
      }
    } else throw new Error("Rates: unknown model " + name);
    if (!best) return null;
    const m = best.model, p = best.p;
    let rate;
    if (name === "cage") rate = p.G;
    else if (name === "dexp" && p.c > Math.exp(-1)) rate = p.G2;
    else { const te = tOfE(m, tMin, tMax); rate = te ? 1 / te : null; }
    const fFirst = m(tMin), fLast = m(tMax);
    const measured = rate !== null && fLast < 0.8 && fFirst > 0.2;
    return { model: name, q: q, rate: rate, params: p, rms: Math.sqrt(best.v / t.length), n: t.length, k: MODELS[name].n,
      measured: measured, why: fLast >= 0.8 ? "slow" : fFirst <= 0.2 ? "fast" : null, curve: m };
  }
  // every q: rows of the analysis ({q_per_um, f}) and the delays
  function fitAll(taus, rows, name) { return rows.map(function (r) { return fitCurve(taus, r.f, r.q_per_um, name); }); }

  // the truth: self intermediate scattering function of the simulated cells, relative to the centre of mass
  function truthFs(pos, T, L, frameH, lags, qs) {
    const N = pos.x.length / T, UX = new Float64Array(T * N), UY = new Float64Array(T * N);
    for (let i = 0; i < N; i++) { UX[i] = pos.x[i]; UY[i] = pos.y[i]; }
    for (let t = 1; t < T; t++) for (let i = 0; i < N; i++) {
      let dx = pos.x[t * N + i] - pos.x[(t - 1) * N + i], dy = pos.y[t * N + i] - pos.y[(t - 1) * N + i];
      dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
      UX[t * N + i] = UX[(t - 1) * N + i] + dx; UY[t * N + i] = UY[(t - 1) * N + i] + dy;
    }
    const out = qs.map(function () { return new Float64Array(lags.length); });
    let vrms = null;
    lags.forEach(function (k, li) {
      const step = Math.max(1, Math.floor((T - k) / 16)), r = [];
      for (let t = 0; t + k < T; t += step) {
        let mx = 0, my = 0;
        for (let i = 0; i < N; i++) { mx += UX[(t + k) * N + i] - UX[t * N + i]; my += UY[(t + k) * N + i] - UY[t * N + i]; }
        mx /= N; my /= N;
        for (let i = 0; i < N; i++) r.push(Math.hypot(UX[(t + k) * N + i] - UX[t * N + i] - mx, UY[(t + k) * N + i] - UY[t * N + i] - my));
      }
      if (li === 0) { let s2 = 0; for (let j = 0; j < r.length; j++) s2 += r[j] * r[j]; vrms = Math.sqrt(s2 / r.length) / (k * frameH); }
      qs.forEach(function (q, qi) { let s = 0; for (let j = 0; j < r.length; j++) s += J0(q * r[j]); out[qi][li] = s / r.length; });
    });
    // vrms: rms speed of a cell relative to the sheet over the shortest delay
    return { q: qs, taus: lags.map(function (k) { return k * frameH; }), f: out.map(function (a) { return Array.from(a); }), vrms: vrms };
  }

  const api = { MODELS: MODELS, fitCurve: fitCurve, fitAll: fitAll, truthFs: truthFs, J0: J0 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TISSUE_RATES = api;
})(typeof self !== "undefined" ? self : this);
