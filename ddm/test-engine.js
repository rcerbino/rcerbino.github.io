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

// (the full pipeline is tested in test-movie.js with the optical simulator)
console.log(failures === 0 ? "\nALL CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
