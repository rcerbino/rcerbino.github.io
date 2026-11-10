// Checks of optics.js against an independent Mie code (miepython 2.5.5) and physical laws.
const O = require("./optics.js");
const fs = require("fs");
let failures = 0;
function check(name, cond, info) { console.log((cond ? "ok   " : "FAIL ") + name + (info ? "  " + info : "")); if (!cond) failures++; }
const ref = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
// miepython's "wiscombe" normalisation equals Bohren-Huffman S1, S2 up to complex conjugation
// (opposite time convention); the reference file stores that normalisation.
for (const c of ref) {
  const M = O.mie(c.m, 0, c.x, Float64Array.from(c.mu));
  for (let j = 0; j < c.mu.length; j++) { c.s1i[j] = -c.s1i[j]; c.s2i[j] = -c.s2i[j]; }
  let err = 0, scale = 0;
  for (let j = 0; j < c.mu.length; j++) {
    err = Math.max(err, Math.abs(M.S1r[j] - c.s1r[j]), Math.abs(M.S1i[j] - c.s1i[j]), Math.abs(M.S2r[j] - c.s2r[j]), Math.abs(M.S2i[j] - c.s2i[j]));
    scale = Math.max(scale, Math.hypot(c.s1r[j], c.s1i[j]));
  }
  check("Mie m=" + c.m.toFixed(4) + " x=" + c.x + ": S1, S2 match miepython", err / scale < 1e-6, "rel err " + (err / scale).toExponential(1));
  check("   Qext, Qsca match", Math.abs(M.Qext / c.qext - 1) < 1e-6 && Math.abs(M.Qsca / c.qsca - 1) < 1e-6, M.Qext.toFixed(6) + " vs " + c.qext.toFixed(6));
}
// optical theorem inside the bright-field kernel: one source on axis, wide pupil, q = 0, in focus
{
  const q = Float64Array.from([0, 0.5]);
  const base = { diameter_um: 0.5, particle: "ps", liquid: { glycerol_w: 0 }, na_obj: 1.3, na_cond: 0, source: "mono", q_per_um: q, z_lo: -1, z_hi: 1, homodyne: false };
  const K = O.brightFieldKernel(base);
  const izf = Array.from(K.z_um).findIndex(v => Math.abs(v) < 1e-9), nzk = K.z_um.length;
  check("interference term at q = 0 equals minus the extinction cross-section", Math.abs(K.K[izf] / -K.Cext_um2 - 1) < 1e-3, K.K[izf].toFixed(5) + " vs " + (-K.Cext_um2).toFixed(5) + " um^2");
  const Kh = O.brightFieldKernel(Object.assign({}, base, { homodyne: true }));
  const Hq0 = Kh.K[izf] - K.K[izf];
  // scattered power into the forward cone of NA 1.3 in water (theta up to ~77 deg), from Mie directly
  const l = 0.532, nm = O.liquidIndex(base.liquid, l), k = 2 * Math.PI * nm / l, x = k * 0.25;
  const thMax = Math.asin(Math.min(0.999, 1.3 / nm)), NT = 4000, mus = new Float64Array(NT);
  for (let i = 0; i < NT; i++) mus[i] = Math.cos(thMax * (i + 0.5) / NT);
  const M = O.mie(O.particleIndex("ps", l) / nm, 0, x, mus);
  let P = 0; for (let i = 0; i < NT; i++) { const t = thMax * (i + 0.5) / NT; const S = 0.5 * (Math.hypot(M.S1r[i], M.S1i[i]) ** 2 + Math.hypot(M.S2r[i], M.S2i[i]) ** 2); P += S * Math.sin(t) * 2 * Math.PI * thMax / NT; }
  P /= k * k;
  check("scattered-intensity term at q = 0 equals scattered power collected", Math.abs(Hq0 / P - 1) < 0.05, Hq0.toFixed(5) + " vs " + P.toFixed(5) + " um^2");
}
// symmetry: the summed kernel must be real (imaginary part small) for a full condenser
{
  const q = new Float64Array(40); for (let i = 0; i < 40; i++) q[i] = i * 0.2;
  // aperture integral vs brute-force sum over many source points, at a few depths
  const K = O.brightFieldKernel({ diameter_um: 0.2, particle: "ps", liquid: { glycerol_w: 0 }, na_obj: 0.5, na_cond: 0.3, source: "mono", q_per_um: q, z_lo: -10, z_hi: 10, homodyne: false });
  const nz = K.z_um.length;
  // brute force: 3000 random points uniform in the aperture, two q orientations
  const l = 0.532, nm = O.liquidIndex({ glycerol_w: 0 }, l), k0 = 2 * Math.PI / l, k = k0 * nm, np = O.particleIndex("ps", l);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pts = []; while (pts.length < 3000) { const x = 2 * rnd() - 1, y = 2 * rnd() - 1; if (x * x + y * y <= 1) pts.push([0.3 * x, 0.3 * y]); }
  const zs = [-6, 0, 2.5]; let worst = 0, scale = 0;
  for (const zv of zs) {
    const iz = Math.round((zv - K.z_um[0]) / K.dz_um);
    for (const iq of [5, 15, 30]) {
      let re = 0, bg = 0;
      for (const [ux, uy] of pts) {
        const kix = k0 * ux, kiy = k0 * uy, kiz = Math.sqrt(k * k - kix * kix - kiy * kiy), Pin = Math.sqrt(kiz / k); bg += Pin * Pin;
        for (const sg of [1, -1]) {
          const kx = kix + sg * q[iq], ky = kiy, kt2 = kx * kx + ky * ky; if (kt2 > (k0 * 0.5) ** 2) continue;
          const kz = Math.sqrt(k * k - kt2), P = Math.sqrt(kz / k), mu = (kix * kx + kiy * ky + kiz * kz) / (k * k);
          const M = O.mie(np / nm, 0, k * 0.1, Float64Array.from([mu])), Sr = 0.5 * (M.S1r[0] + M.S2r[0]), Si = 0.5 * (M.S1i[0] + M.S2i[0]);
          const amp = -(2 * Math.PI / k) * Pin * P / kz, ph = sg * (kiz - kz) * zv;
          re += amp * (Sr * Math.cos(ph) - sg * Si * Math.sin(ph));
        }
      }
      re /= bg; const v = K.K[iq * nz + iz];
      worst = Math.max(worst, Math.abs(v - re)); scale = Math.max(scale, Math.abs(re));
    }
  }
  check("aperture integral matches a brute-force sum over 3000 source points", worst / scale < 0.03, "max deviation " + (100 * worst / scale).toFixed(2) + " % of the largest value");
}
// fluorescence: widefield OTF cutoff at 2 NA / lambda and total signal independent of defocus
{
  const q = new Float64Array(80); for (let i = 0; i < 80; i++) q[i] = i * 0.25;
  const z = Float64Array.from([0, 2, 5]);
  const F = O.fluorescenceKernel({ na_obj: 0.5, liquid: { glycerol_w: 0 }, l_ex: 0.488, l_em: 0.52, diameter_um: 0.1, q_per_um: q, z_um: z, confocal: false });
  const qc = 4 * Math.PI * 0.5 / 0.52;
  let beyond = 0, inside = 0; for (let i = 0; i < 80; i++) { if (q[i] > 1.08 * qc) beyond = Math.max(beyond, Math.abs(F.K[i * 3])); else inside = Math.max(inside, Math.abs(F.K[i * 3])); }
  check("widefield transfer vanishes beyond 4 pi NA / lambda", beyond / inside < 0.03, "ratio " + (beyond / inside).toExponential(1));
  check("widefield: total light of a particle does not depend on focus", Math.abs(F.K[1] - 1) < 0.03 && Math.abs(F.K[2] - 1) < 0.05, "q=0 at z=0,2,5: " + [F.K[0], F.K[1], F.K[2]].map(v => v.toFixed(3)).join(", "));
  const C = O.fluorescenceKernel({ na_obj: 0.5, liquid: { glycerol_w: 0 }, l_ex: 0.488, l_em: 0.52, diameter_um: 0.1, q_per_um: q, z_um: z, confocal: true, pinhole_um_sample: 50 / 20 });
  check("confocal: out-of-focus light is rejected", C.K[2] < 0.5 * C.K[0], "q=0 at z=0,2,5: " + [C.K[0], C.K[1], C.K[2]].map(v => v.toFixed(3)).join(", "));
}
// low-rank split reproduces the kernel
{
  const q = new Float64Array(60); for (let i = 0; i < 60; i++) q[i] = i * 0.15;
  const K = O.brightFieldKernel({ diameter_um: 0.2, particle: "ps", liquid: { glycerol_w: 0 }, na_obj: 0.5, na_cond: 0.3, source: "green", q_per_um: q, z_lo: -20, z_hi: 0, homodyne: false });
  const nz = K.z_um.length;
  const L = O.lowRank(K.K, 60, nz, 1e-4, 16);
  let e = 0, t = 0; for (let i = 0; i < 60; i++) for (let a = 0; a < nz; a++) { let s = 0; for (let m = 0; m < L.rank; m++) s += L.U[m][i] * L.V[m][a]; e += (s - K.K[i * nz + a]) ** 2; t += K.K[i * nz + a] ** 2; }
  check("low-rank split: rank " + L.rank + " reproduces the kernel", e / t < 2e-4, "residual " + (e / t).toExponential(1));
}

// ---- phase contrast, dark field, DIC -------------------------------------------------------
{
  const O2 = O, lw = { glycerol_w: 0 };
  // dark field: annular illumination outside the objective; q = 0 equals the collected scattered power / incident light
  const q = Float64Array.from([0, 0.2]);
  const DF = O2.transmittedKernel({ diameter_um: 0.5, particle: "ps", liquid: lw, na_obj: 0.5, illum: { na_in: 0.8, na_out: 0.95 }, pupil: { kind: "none" }, source: "mono", q_per_um: q, z_lo: -1, z_hi: 1, homodyne: true });
  const izf = Array.from(DF.z_um).findIndex(v => Math.abs(v) < 1e-9), nz = DF.z_um.length;
  const l = 0.532, nm = O2.liquidIndex(lw, l), k0 = 2 * Math.PI / l, k = k0 * nm, np = O2.particleIndex("ps", l);
  let Pc = 0, Inc = 0;
  const NR = 6, NPH = 24, NT = 60, NP2 = 48;
  for (let ir = 0; ir < NR; ir++) {
    const u = Math.sqrt(0.8 * 0.8 + (0.95 * 0.95 - 0.8 * 0.8) * (ir + 0.5) / NR), sti = u / nm, cti = Math.sqrt(1 - sti * sti);
    for (let ip = 0; ip < NPH; ip++) {
      const ph = 2 * Math.PI * ip / NPH, si = [sti * Math.cos(ph), sti * Math.sin(ph), cti];
      Inc += cti;
      // collected cone: directions with n sin(theta) <= 0.5, aplanatic: power = int |S|^2 / k^2 dOmega (as in the bright-field check)
      const thMax = Math.asin(0.5 / nm); const mus = [], wts = [];
      for (let it = 0; it < NT; it++) { const th = thMax * (it + 0.5) / NT; for (let jp = 0; jp < NP2; jp++) { const p2 = 2 * Math.PI * jp / NP2, so = [Math.sin(th) * Math.cos(p2), Math.sin(th) * Math.sin(p2), Math.cos(th)]; mus.push(si[0] * so[0] + si[1] * so[1] + si[2] * so[2]); wts.push(Math.sin(th) * thMax / NT * 2 * Math.PI / NP2); } }
      const M = O2.mie(np / nm, 0, k * 0.25, Float64Array.from(mus));
      for (let j = 0; j < mus.length; j++) Pc += wts[j] * 0.5 * (M.S1r[j] * M.S1r[j] + M.S1i[j] * M.S1i[j] + M.S2r[j] * M.S2r[j] + M.S2i[j] * M.S2i[j]) / (k * k);   // unpolarised power
    }
  }
  const expect = Pc / Inc;
  check("dark field: no direct light, signal = scattered power collected", DF.dark && Math.abs(DF.Kr[izf] / expect - 1) < 0.05, "kernel " + DF.Kr[izf].toExponential(3) + " vs brute force " + expect.toExponential(3) + " um^2");
  // phase contrast: which ring phase makes a higher-index particle dark in focus (positive, "dark" contrast)
  const qq = new Float64Array(120); for (let i = 0; i < 120; i++) qq[i] = i * 0.12;
  const center = function (phase) {
    const P = O2.transmittedKernel({ diameter_um: 0.3, particle: "ps", liquid: lw, na_obj: 0.75, illum: { na_in: 0.24, na_out: 0.29 }, pupil: { kind: "phase", ring_in: 0.24, ring_out: 0.29, amp: 0.5, phase: phase }, source: "mono", q_per_um: qq, z_lo: -0.5, z_hi: 0.5, homodyne: false });
    const nzp = P.z_um.length, iz = Array.from(P.z_um).findIndex(v => Math.abs(v) < 1e-9);
    let s = 0; for (let i = 0; i < 120; i++) s += P.Kr[i * nzp + iz] * qq[i] * 0.12 / (2 * Math.PI);
    return s;
  };
  const cp = center(Math.PI / 2), cm = center(-Math.PI / 2);
  console.log("info phase contrast, in-focus centre contrast: ring phase +pi/2 -> " + cp.toFixed(3) + ", -pi/2 -> " + cm.toFixed(3));
  check("phase contrast: the two ring signs give opposite contrast", cp * cm < 0);
  // DIC: signal along the shear, almost none across it (weak object: 1 - cos(q.s))
  // a small bead is nearly a pure phase object; a larger one also has amplitude contrast, visible in every direction
  const D = O2.transmittedKernel({ diameter_um: 0.05, particle: "ps", liquid: lw, na_obj: 0.75, illum: { na_in: 0, na_out: 0.5 }, pupil: { kind: "dic", shear_um: 0.24, angle: 0, bias: Math.PI / 2 }, source: "mono", q_per_um: qq, z_lo: -0.5, z_hi: 0.5, homodyne: false });
  const nzd = D.z_um.length, izd = Array.from(D.z_um).findIndex(v => Math.abs(v) < 1e-9), nqd = qq.length;
  const mag = function (d, iq) { const o = (d * nqd + iq) * nzd + izd; return Math.hypot(D.Kr[o], D.Ki[o]); };
  const along = mag(0, 25), across = mag(4, 25);   // direction 0 = along the shear, 4 = 90 degrees
  check("DIC, 50 nm bead (phase object): signal along the shear, almost none across it", across < 0.1 * along, "across / along = " + (across / along).toExponential(1) + " at q = 3 um^-1");
}
// non-spherical and birefringent particles, polarisers
{
  const O2 = require("./optics.js");
  const kT = 1.380649e-23 * 295, eta = 1e-3;
  const sph = O2.hydrodynamics(O2.shapeGeometry("sphere", 1, 1), kT, eta);
  check("sphere: D = kT / (6 pi eta a), D_r = kT / (8 pi eta a^3)", Math.abs(sph.D_t / (kT / (6 * Math.PI * eta * 0.5e-6) * 1e12) - 1) < 1e-12 && Math.abs(sph.D_r / (kT / (8 * Math.PI * eta * 0.125e-18)) - 1) < 1e-12);
  const pr = O2.hydrodynamics(O2.shapeGeometry("prolate", 1, 1.0001), kT, eta), ob = O2.hydrodynamics(O2.shapeGeometry("oblate", 1, 1.0001), kT, eta);
  check("Perrin spheroids tend to the sphere", Math.abs(pr.D_t / sph.D_t - 1) < 1e-3 && Math.abs(pr.D_r / sph.D_r - 1) < 1e-3 && Math.abs(ob.D_t / sph.D_t - 1) < 1e-3 && Math.abs(ob.D_r / sph.D_r - 1) < 1e-3);
  const lp = O2.hydrodynamics(O2.shapeGeometry("prolate", 2, 50), kT, eta), a = 1e-6;
  const perrinLong = 3 * kT * (Math.log(100) - 0.5) / (8 * Math.PI * eta * a * a * a);
  check("long prolate: D_r near 3 kT (ln 2p - 1/2) / (8 pi eta a^3)", Math.abs(lp.D_r / perrinLong - 1) < 0.02, "ratio " + (lp.D_r / perrinLong).toFixed(4));
  const rod = O2.hydrodynamics(O2.shapeGeometry("rod", 2, 5), kT, eta), lnp = Math.log(5);
  const dtAvg = kT * (lnp + 0.312 + 0.565 / 5 - 0.100 / 25) / (3 * Math.PI * eta * 2e-6) * 1e12;
  check("rod: (D_par + 2 D_perp) / 3 agrees with the Tirado formula for D_t", Math.abs(rod.D_t / dtAvg - 1) < 0.01, "ratio " + (rod.D_t / dtAvg).toFixed(4));
  for (const sh of ["prolate", "oblate", "rod"]) { const L = O2.depolarization(sh, 3); check("depolarisation factors of " + sh + " add up to 1", Math.abs(L[0] + 2 * L[1] - 1) < 1e-12); }
  const Lsph = O2.depolarization("prolate", 1.00001);
  check("depolarisation factors tend to 1/3 for a sphere", Math.abs(Lsph[0] - 1 / 3) < 1e-4);
  // polarisers: an isotropic particle gives no signal between crossed polarisers; parallel ones change nothing
  const cr = O2.polCoeffs({ polarizer_deg: 0, analyzer_deg: 90, extinction: 0 }, 1, 0, 0.6, 0.3);
  const pa = O2.polCoeffs({ polarizer_deg: 30, analyzer_deg: 30, extinction: 0 }, 1, 0, 0.6, 0.3), none = O2.polCoeffs(null, 1, 0, 0.6, 0.3);
  check("crossed polarisers: isotropic particle and background vanish", Math.abs(cr.het) < 1e-15 && Math.abs(cr.hom) < 1e-15 && Math.abs(cr.bg) < 1e-15);
  check("parallel polarisers or none: isotropic particle as without polarisers", Math.abs(pa.het - 1) < 1e-12 && Math.abs(pa.hom - 1) < 1e-12 && Math.abs(none.het - 1) < 1e-12 && Math.abs(none.hom - 1) < 1e-12);
  // depolarised signal of an anisotropic particle between crossed polarisers: dalpha^2 (t.eA)^2 (t.eP)^2
  const dep = O2.polCoeffs({ polarizer_deg: 0, analyzer_deg: 90, extinction: 0 }, 1, 0.2, Math.cos(0.5), Math.sin(0.5));
  check("crossed polarisers: depolarised intensity of a tilted anisotropic particle", Math.abs(dep.hom - Math.pow(0.2 * Math.cos(0.5) * Math.sin(0.5), 2)) < 1e-15);
  const g = O2.shapeGeometry("rod", 2, 4), pts = O2.bodyPoints(g, 0.2, 64);
  check("body points fill the rod (centred, at most 64)", pts.n <= 64 && pts.n > 4 && Math.abs(Array.from(pts.xyz).filter((v, i) => i % 3 === 0).reduce((s, v) => s + v, 0)) < 1e-9, pts.n + " points, spacing " + pts.spacing.toFixed(3) + " um");
}
// ---- vector optics and aberration ---------------------------------------------------------
{
  const n = function (v) { const m = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / m); };
  const g0 = O.vectorWeights([0, 0, 1], n([0.8, 0.3, 0.52]));
  check("vector weights: on-axis light through an aplanatic objective keeps the scalar (S1 + S2) / 2", Math.abs(g0[0] - 0.5) < 1e-12 && Math.abs(g0[1] - 0.5) < 1e-12);
  const a = n([0.6, 0, 0.8]), gf = O.vectorWeights(a, a), g1 = O.vectorWeights(a, n([-0.6, 0.0, 0.8])), g2 = O.vectorWeights(a, n([0, 0.6, 0.8]));
  check("vector weights: forward scattering of tilted light keeps (S1 + S2) / 2", Math.abs(gf[0] - 0.5) < 1e-12 && Math.abs(gf[1] - 0.5) < 1e-12);
  check("vector weights: within the plane of incidence the polarisations stay aligned", Math.abs(g1[0] + g1[1] - 1) < 1e-12);
  check("vector weights: tilted light scattered out of its plane interferes less", g2[0] + g2[1] < 0.99, "G1 + G2 = " + (g2[0] + g2[1]).toFixed(3));
  let dmax = 0; const out = new Float64Array(2);
  for (let t = 0; t < 500; t++) { const a = n([Math.sin(t) * 0.7, Math.cos(3 * t) * 0.7, 1]), b = n([Math.cos(5 * t) * 0.8, Math.sin(7 * t) * 0.8, 1]), g = O.vectorWeights(a, b); O.vectorWeightsInto(a[0], a[1], a[2], b[0], b[1], b[2], out); dmax = Math.max(dmax, Math.abs(out[0] - g[0]), Math.abs(out[1] - g[1])); }
  check("vector weights: fast inner-loop version agrees", dmax < 1e-12, "max difference " + dmax.toExponential(1));
  const r = new Float64Array(120); for (let i = 0; i < 120; i++) r[i] = i * 0.005;
  const z = new Float64Array(201); for (let i = 0; i < 201; i++) z[i] = -2 + i * 0.02;
  const peak = function (P) { let m = 0; for (let iz = 0; iz < z.length; iz++) m = Math.max(m, P[iz]); return m; };
  const ps = peak(O.psfStack(0.3, 1.333, 0.52, r, z, null, true)), pv = peak(O.psfStack(0.3, 1.333, 0.52, r, z, null, false));
  check("vector focal spot tends to the scalar one at small aperture", Math.abs(pv / ps - 1) < 0.02, "peak ratio " + (pv / ps).toFixed(4));
  check("no aberration when immersion and liquid match", O.aberrationFit({ n_imm: 1.333, depth_um: 20 }, 1.333, 1.2) === null);
  const s0 = peak(O.psfStack(1.4, 1.333, 0.52, r, z, null, false));
  const s = [2, 10, 20].map(d => peak(O.psfStack(1.4, 1.333, 0.52, r, z, { n_imm: 1.518, depth_um: d }, false)) / s0);
  check("oil objective focused into water: peak falls with depth", s[0] < 0.8 && s[1] < s[0] && s[2] < s[1], "relative peak at 2, 10, 20 um: " + s.map(v => v.toFixed(2)).join(", "));
}
// DIC mirror symmetry: directions filled from their mirror image across the shear agree with the full calculation
{
  const q = new Float64Array(40); for (let i = 0; i < 40; i++) q[i] = i * 0.2;
  const base = { diameter_um: 0.3, particle: "ps", liquid: { glycerol_w: 0 }, na_obj: 1.2, illum: { na_in: 0, na_out: 0.5 }, pupil: { kind: "dic", shear_um: 0.24, angle: Math.PI / 4, bias: Math.PI / 2 }, source: "mono", q_per_um: q, z_lo: -2, z_hi: 0.5, homodyne: false };
  const A = O.transmittedKernel(base), B = O.transmittedKernel(Object.assign({}, base, { no_mirror: true }));
  let mx = 0, dm = 0; for (let i = 0; i < A.Kr.length; i++) { mx = Math.max(mx, Math.hypot(B.Kr[i], B.Ki[i])); dm = Math.max(dm, Math.hypot(A.Kr[i] - B.Kr[i], A.Ki[i] - B.Ki[i])); }
  check("DIC: mirrored directions agree with the full calculation", dm / mx < 0.01, "largest difference " + (100 * dm / mx).toFixed(2) + " % of the largest value");
}
console.log(failures === 0 ? "\nALL OPTICS CHECKS PASSED" : "\n" + failures + " CHECK(S) FAILED");
process.exit(failures ? 1 : 0);
