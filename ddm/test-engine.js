// Checks of the DDM engine against known answers. Run: node test-engine.js
const DDM = require("./ddm-engine.js");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }

// 1. FFT against a direct DFT
{
  const n = 16, tb = DDM._test.makeFftTables(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.sin(0.7 * i) + 0.3 * i; im[i] = Math.cos(1.3 * i); }
  const r0 = Float64Array.from(re), i0 = Float64Array.from(im);
  DDM._test.fft1d(re, im, tb);
  let err = 0;
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) { const a = -2 * Math.PI * j * k / n; sr += r0[j] * Math.cos(a) - i0[j] * Math.sin(a); si += r0[j] * Math.sin(a) + i0[j] * Math.cos(a); }
    err = Math.max(err, Math.abs(sr - re[k]), Math.abs(si - im[k]));
  }
  check("FFT matches direct DFT", err < 1e-10, "max error " + err.toExponential(2));
}

// 2. physical constants
{
  const eta = DDM.waterViscosity_Pa_s(20);
  check("water viscosity at 20 C near 1.002 mPa s", Math.abs(eta - 1.002e-3) / 1.002e-3 < 0.01, (eta * 1e3).toFixed(4) + " mPa s");
  const D = DDM.diffusion_um2_s(1.0, 25, DDM.waterViscosity_Pa_s(25));
  check("1 um sphere in water at 25 C: D near 0.49 um^2/s", Math.abs(D - 0.49) < 0.01, D.toFixed(4));
  check("Stokes-Einstein round trip", Math.abs(DDM.diameterFromD_um(D, 25, DDM.waterViscosity_Pa_s(25)) - 1) < 1e-12);
}

// 3. fit recovers Gamma from an exact curve
{
  const taus = []; for (let i = 0; i < 30; i++) { const v = 0.01 * Math.round(Math.exp(Math.log(128) * i / 29)); if (!taus.length || v > taus[taus.length - 1] + 1e-12) taus.push(v); }
  const A = 3, B = 0.5, G = 7.3;
  const y = Float64Array.from(taus.map(t => A * (1 - Math.exp(-G * t)) + B));
  const f = DDM._test.fitOne(taus, y, (A + B) / 2, B, "simple", 1, 1);
  check("exact curve: Gamma recovered", Math.abs(f.gamma_hz / G - 1) < 1e-4, f.gamma_hz.toFixed(5));
  const ys = Float64Array.from(taus.map(t => A * (1 - Math.exp(-Math.pow(G * t, 0.7))) + B));
  const fs = DDM._test.fitOne(taus, ys, (A + B) / 2, B, "stretched", 1, 1);
  check("exact stretched curve: beta recovered", Math.abs(fs.beta - 0.7) < 1e-3, "beta " + fs.beta.toFixed(4));
  // Schulz distribution of rates (mean G, PI 0.2): exact average (1 + PI G t)^(-1/PI)
  const yz = Float64Array.from(taus.map(t => A * (1 - Math.pow(1 + 0.2 * G * t, -1 / 0.2)) + B));
  const fz = DDM._test.fitOne(taus, yz, (A + B) / 2, B, "schulz", 1, 1);
  check("exact Schulz curve: mean rate and PI recovered", Math.abs(fz.gamma_hz / G - 1) < 1e-3 && Math.abs(fz.pi - 0.2) < 1e-3, "Gamma " + fz.gamma_hz.toFixed(4) + ", PI " + fz.pi.toFixed(4));
  // the same curve sampled numerically from a Schulz distribution of rates: the cumulant PI is close to 0.2
  // (second-order cumulants over f = 1 to 0.1 are biased low by the third cumulant: 0.14 for a true 0.2)
  const z = 1 / 0.2 - 1, NG = 4000, rates = [], wts = [];
  for (let i = 0; i < NG; i++) { const x = (i + 0.5) * 30 / NG; rates.push(G * x / (z + 1)); wts.push(Math.pow(x, z) * Math.exp(-x)); }
  const W = wts.reduce((a, b) => a + b, 0);
  const fnum = taus.map(t => rates.reduce((acc, r, i) => acc + wts[i] * Math.exp(-r * t), 0) / W);
  const dq = taus.map((t, i) => { const row = new Float64Array(3); row[1] = A * (1 - fnum[i]) + B; return row; });
  const yq = Float64Array.from(dq.map(r => r[1]));
  const item = () => ({ f: { bin: 1, q_per_um: 1, lnGamma_se: 0.01 }, y: yq, fit: DDM._test.fitOne(taus, yq, (A + B) / 2, B, "schulz", 1, 1) });
  const sfree = [item(), item(), item()];
  const cu = DDM._test.cumulants(taus, dq, sfree);
  check("cumulants on a Schulz curve (PI 0.2): second order reads low, as in DLS, but within 0.08", cu.pi !== null && cu.pi < 0.2 && cu.pi > 0.12 && Math.abs(cu.D_um2_s / G - 1) < 0.05, cu.pi === null ? "none" : "PI " + cu.pi.toFixed(3) + ", Gamma " + cu.D_um2_s.toFixed(3));
  check("third-order cumulants come closer to PI 0.2", cu.third && Math.abs(cu.third.pi - 0.2) < Math.abs(cu.pi - 0.2), cu.third ? "PI " + cu.third.pi.toFixed(3) : "none");
  // one PI shared by several q (rates scaling as q^2): the shared Schulz fit returns it
  const sh = [0.6, 1, 1.5, 2.2].map(qq => { const Gq = G * qq * qq, y = Float64Array.from(taus.map(t => A * (1 - Math.pow(1 + 0.2 * Gq * t, -1 / 0.2)) + B + 1e-3 * Math.sin(37 * t * qq))); return { f: { bin: 1, q_per_um: qq, lnGamma_se: 0.01 }, y: y, fit: DDM._test.fitOne(taus, y, (A + B) / 2, B, "schulz", 1, qq) }; });
  const ss = DDM._test.sharedSchulz(taus, Float64Array.from([0, (A + B) / 2]), Float64Array.from([0, B]), sh);
  check("shared Schulz fit over four q recovers PI 0.2", ss && Math.abs(ss.pi - 0.2) < 0.01, ss ? "PI " + ss.pi.toFixed(4) : "none");
}

// 4. two-mode fit recovers both rates and the amplitude split; a one-mode curve stays one mode
{
  const taus = []; for (let i = 0; i < 40; i++) { const v = 0.001 * Math.round(Math.exp(Math.log(512) * i / 39)); if (!taus.length || v > taus[taus.length - 1] + 1e-12) taus.push(v); }
  const A = 3, B = 0.2, G1 = 4, G2 = 160, a = 0.4;
  const y = Float64Array.from(taus.map(t => A * (1 - a * Math.exp(-G1 * t) - (1 - a) * Math.exp(-G2 * t)) + B));
  const f1 = DDM._test.fitOne(taus, y, (A + B) / 2, B, "simple", 1, 1);
  const f2 = DDM._test.fitTwo(taus, y, f1);
  check("two modes: both rates recovered", f2.two && Math.abs(f2.gamma_hz / G1 - 1) < 1e-3 && Math.abs(f2.gamma2_hz / G2 - 1) < 1e-3, f2.two ? f2.gamma_hz.toFixed(4) + " / " + f2.gamma2_hz.toFixed(3) + ", slow share " + f2.frac_slow.toFixed(4) : "not found");
  const rng = DDM._test.makeRng(5);
  const y1 = Float64Array.from(taus.map(t => A * (1 - Math.exp(-20 * t)) + B + 0.003 * rng.gauss()));
  const g1 = DDM._test.fitOne(taus, y1, (A + B) / 2, B, "simple", 1, 1), g2 = DDM._test.fitTwo(taus, y1, g1);
  check("one-mode curve with noise is kept as one mode", !g2.two, g2.two ? "split into " + g2.gamma_hz.toFixed(2) + " and " + g2.gamma2_hz.toFixed(2) : "");
}

// log-spaced frames: every Fourier mode an Ornstein-Uhlenbeck process with rate G(q) = D q^2, sampled exactly at uneven
// times (movie.js logTimes). The structure function from grouped pairs must equal 2 var (1 - exp(-G tau)), and the
// evenly spaced frames must give the same groups as before (no times: the integer-lag path)
{
  const MOVIE = require("./movie.js");
  const n = 32, T = 256, P = n * n, dt = 0.02, L_um = 50, D = 0.4, rng = DDM._test.makeRng(11);
  const times = MOVIE.logTimes(T, dt, 20);
  let gaps = Infinity; for (let k = 1; k < T; k++) gaps = Math.min(gaps, times[k] - times[k - 1]);
  const span = (times[T - 1] + dt) / (T * dt);
  check("log-spaced frames: no two frames closer than the frame interval, movie about 20 times longer", gaps >= dt * (1 - 1e-9) && Math.abs(span / 20 - 1) < 0.1, "shortest gap " + (gaps / dt).toFixed(3) + " frame intervals, movie " + span.toFixed(1) + " times longer");
  const fft = new Float32Array(2 * P * T), rate = new Float64Array(P);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const kx = ix < n / 2 ? ix : ix - n, ky = iy < n / 2 ? iy : iy - n, q = 2 * Math.PI * Math.hypot(kx, ky) / L_um, p = iy * n + ix;
    rate[p] = D * q * q;
    let re = rng.gauss(), im = rng.gauss();
    for (let t = 0; t < T; t++) {
      if (t > 0) { const e = Math.exp(-rate[p] * (times[t] - times[t - 1])), s = Math.sqrt(1 - e * e); re = e * re + s * rng.gauss(); im = e * im + s * rng.gauss(); }
      fft[2 * P * t + 2 * p] = re * Math.sqrt(P); fft[2 * P * t + 2 * p + 1] = im * Math.sqrt(P);   // variance per mode 2 after the 1/P normalisation
    }
  }
  const movie = { n: n, T: T, fft: fft, L_um: L_um, pixel_um: L_um / n, frame_rate_hz: 1 / dt, q_opt_per_um: 10, q_signal_max_per_um: 10, times_s: times };
  const S = DDM.runToEnd(DDM.structure(movie, {}));
  // wave vectors whose modes relax many times during the movie (the scatter of slower ones is set by the few
  // independent stretches of movie, not by the method)
  let worst = 0, mean = 0, nb = 0;
  for (const b of [8, 11, 14]) {
    const q = S.q_per_um[b], G = D * q * q;
    for (let i = 0; i < S.L; i++) {
      const th = 4 * (1 - Math.exp(-G * S.taus_s[i]));
      if (th > 0.2) { const r = S.dq[i][b] / th - 1; worst = Math.max(worst, Math.abs(r)); mean += r; nb++; }
    }
  }
  mean /= nb;
  let ratio = 0; for (let i = 1; i < S.L; i++) ratio = Math.max(ratio, S.taus_s[i] / S.taus_s[i - 1]);
  check("log-spaced frames: delays without gaps (no two next delays more than a factor 2 apart)", ratio <= 2.0001, S.L + " delays, largest ratio " + ratio.toFixed(2));
  check("log-spaced frames: structure function from grouped pairs follows 2 var (1 - exp(-D q^2 tau))", worst < 0.12 && Math.abs(mean) < 0.04, S.L + " delays from " + (S.taus_s[0] / dt).toFixed(0) + " to " + (S.taus_s[S.L - 1] / dt).toFixed(0) + " frame intervals; mean relative difference " + (100 * mean).toFixed(1) + " %, largest " + (100 * worst).toFixed(1) + " % over " + nb + " points");
  let nmax = 0; for (const pr of S.pairs) nmax = Math.max(nmax, pr.length / 2);
  check("log-spaced frames: at most as many pairs per delay as frames", nmax <= T, "most pairs in one group " + nmax);
}

// (the full pipeline is tested in test-movie.js with the optical simulator)
console.log(failures === 0 ? "\nALL CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
