/* Analysis of swimmers (active particles) by DDM, on top of the structure function of ddm-engine.js.
 *
 * Models of the intermediate scattering function f(q, dt) (self part, independent particles):
 *  - swimmers in 3D with a Schulz distribution of speeds (mean v, relative SD s, shape Z = 1/s^2 - 1), a share alpha that
 *    swims and diffusion D for everybody (Wilson et al., Phys. Rev. Lett. 106, 018101, 2011):
 *      f = exp(-D q^2 dt) [ (1 - alpha) + alpha S3 ],  S3 = (Z + 1) / (Z X) sin(Z atan L) / (1 + L^2)^(Z/2),
 *      X = q v dt, L = X / (Z + 1)   [the average of sin(q v dt) / (q v dt) over the speeds]
 *  - swimmers in the image plane (along the glass): the same with S2 = average of J0(q v dt) over the speeds
 *      = (1 + L^2)^(-(Z+1)/2) P_Z(1 / sqrt(1 + L^2)), computed here by Gauss-Laguerre quadrature over the speeds
 *  - compressed exponential exp(-(Gamma dt)^beta) at each q, Gamma = v0 q for ballistic motion
 *    (Lu et al., Phys. Rev. Lett. 108, 218103, 2012; Hitchhiker's guide to DDM, J. Chem. Phys. 2025, section V B 1)
 * Speed distribution P(v):
 *  - from the fitted compressed exponential, by the inverse of the 3D kernel (guide Eq. 58):
 *      P(v) = (2 v / pi) int_0^inf x f(x) sin(x v) dx   (x = q dt), or the inverse Hankel transform for 2D: P(v) = v int x f(x) J0(x v) dx
 *  - from the measured f(q, dt) of all q in the window: non-negative least squares on a grid of speeds (with a bin at v = 0
 *    for particles that do not swim), with a small penalty on curvature.
 */
(function (root) {
  "use strict";
  const DDM = (typeof module !== "undefined" && module.exports) ? require("./ddm-engine.js") : root.DDM;
  function fail(msg) { throw new Error("Swimmers: " + msg); }
  function need(c, msg) { if (!c) fail(msg); }

  // Bessel J0 (rational approximations, Numerical Recipes; absolute error about 1e-8)
  function besselJ0(x) {
    const ax = Math.abs(x);
    if (ax < 8) {
      const y = x * x;
      const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * (-184.9052456)))));
      const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
      return a / b;
    }
    const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
    const a = 1.0 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
    const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
    return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  }
  // 3D: average of sin(X u) / (X u) over u = v / vmean with a Schulz distribution of shape Z
  function swim3(X, Z) {
    if (X < 1e-8) return 1;
    const L = X / (Z + 1), at = Math.atan(L);
    const sz = Z > 1e-6 ? Math.sin(Z * at) / Z : at;          // sin(Z a) / Z -> a for Z -> 0
    return (Z + 1) / X * sz / Math.pow(1 + L * L, Z / 2);
  }
  // 2D: average of J0(X u) over the Schulz distribution of u (mean 1). With J0(a) = (1/pi) int_0^pi cos(a sin phi) dphi and
  // the characteristic function of the gamma distribution: S2 = (2/pi) int_0^(pi/2) (1 + L^2 sin^2)^(-(Z+1)/2) cos((Z+1) atan(L sin)) dphi,
  // L = X / (Z + 1). The phase stays below X, so about X / pi oscillations: Simpson with 24 + 4 X intervals.
  function swim2(X, Z) {
    if (X < 1e-8) return 1;
    const L = X / (Z + 1), e = -(Z + 1) / 2;
    let n = Math.min(4000, 24 + 4 * Math.ceil(X)); if (n % 2) n++;
    const h = Math.PI / 2 / n;
    let s = 0;
    for (let k = 0; k <= n; k++) {
      const sn = Math.sin(k * h), ls = L * sn, v = Math.pow(1 + ls * ls, e) * Math.cos((Z + 1) * Math.atan(ls));
      s += (k === 0 || k === n ? 1 : (k % 2 ? 4 : 2)) * v;
    }
    return s * h / 3 * 2 / Math.PI;
  }
  function shapeOf(spread) { return 1 / (spread * spread) - 1; }
  // cells that do not swim but turn (rods): a share b of their signal depends on how they are turned and fades as
  // exp(-6 D_R t) (first orientation mode); b = 0 for round cells
  function stillTurn(p, t) { return p.b ? (1 - p.b) + p.b * Math.exp(-6 * p.Dr * t) : 1; }
  // 3D swimmers with a stroke along the axis (Martinez et al. 2012, Chlamydomonas; Jepson et al. 2019, sperm):
  // displacement v t + A [sin(2 pi f t + phi) - sin phi] with a random phase phi. Averaging over phi gives J0(q mu a),
  // a = 2 A |sin(pi f t)|, mu the cosine to q; over the Schulz speeds the cosine averages in closed form, so
  //   S = int_0^1 dmu (1 + L^2)^(-(Z+1)/2) cos((Z + 1) atan L) J0(q mu a),  L = q mu vmean t / (Z + 1)
  // (with a = 0 this is the sine over its argument of Wilson's model). A stroke across the axis (sperm head), in a
  // direction turned at random about the axis: J0(q mu a) becomes J0(q a sqrt(1 - mu^2) / 2)^2 (average of
  // J0(z cos psi) over psi).
  function swimStroke(q, t, v, Z, A, f, across) {
    const X = q * v * t, qa = q * 2 * A * Math.abs(Math.sin(Math.PI * f * t));
    if (qa < 1e-6) return swim3(X, Z);
    const c = Z + 1;
    // the speed average falls as L^-c: beyond L = 10^(4/c) the integrand is below 1e-4 and is left out
    const mx = Math.min(1, Math.pow(10, 4 / c) * c / Math.max(X, 1e-9));
    if (across && mx < 1) { /* the stroke factor does not vanish at large mu: keep the cut, the speed factor is below 1e-4 there */ }
    // over [0, mx] the speed average turns through at most c pi / 2 and J0 oscillates q a mx / pi times: smooth, so
    // Simpson with a few dozen intervals (broad speed distributions, small c, have a long tail and get more)
    let n = Math.min(2000, (c < 3 ? 48 : 24) + 2 * Math.ceil(2 * qa * mx + 3 * Math.min(X * mx, c) / Math.PI)); if (n % 2) n++;
    const h = mx / n;
    let s = 0;
    for (let k = 0; k <= n; k++) {
      const mu = k * h, L = X * mu / c, j = across ? besselJ0(0.5 * qa * Math.sqrt(1 - mu * mu)) : 0;
      const val = Math.pow(1 + L * L, -c / 2) * Math.cos(c * Math.atan(L)) * (across ? j * j : besselJ0(qa * mu));
      s += (k === 0 || k === n ? 1 : (k % 2 ? 4 : 2)) * val;
    }
    return s * h / 3;
  }
  function swimF(kind, q, t, p) {   // p: { v, alpha, spread, D, b, Dr, A, f }
    const Z = shapeOf(p.spread), X = q * p.v * t, S = kind === "2d" ? swim2(X, Z) : kind === "stroke" || kind === "strokex" ? swimStroke(q, t, p.v, Z, p.A, p.f, kind === "strokex") : swim3(X, Z);
    return Math.exp(-p.D * q * q * t) * ((1 - p.alpha) * stillTurn(p, t) + p.alpha * S);
  }

  /* Depth response. A particle at depth z contributes K(q, z) exp(-i q.x) to the image (K from the optics). For a particle
   * that moves by a laterally and by dz along the light, the self part of f is <exp(-i q.a) K(q, z) K*(q, z + dz)> / <|K|^2>.
   * C_q(dz) = sum_z K(q, z) K*(q, z') / sum_z |K(q, z)|^2 over the cell (z' = z + dz mirrored at the walls, as the particles
   * bounce), real part (both directions of dz are equally likely). Straight swimmers in random 3D directions moving
   * s = v t: lateral s sqrt(1 - mu^2), axial s mu, so
   *   h_q(s) = int_0^1 dmu J0(q s sqrt(1 - mu^2)) Re C_q(s mu) = (1/s) int_0^s da J0(q sqrt(s^2 - a^2)) Re C_q(a),
   * and the swimmers give int dv P(v) h_q(v t) exp(-D q^2 t). Particles that do not swim: exp(-D q^2 t) times the
   * average of Re C_q over a Gaussian axial step of variance 2 D t. Without the depth response (C = 1) this is Wilson's model. */
  function kernelAt(info, q) {
    const K = info.kernel, qk = info.kernel_q, nq = qk.length, nz = K.z_um.length;
    const tq = Math.min(nq - 2, Math.max(0, q / qk[nq - 2] * (nq - 2))), i = Math.floor(tq), f = tq - i;
    const re = new Float64Array(nz), im = new Float64Array(nz);
    for (let j = 0; j < nz; j++) {
      re[j] = K.Kr[i * nz + j] + f * (K.Kr[(i + 1) * nz + j] - K.Kr[i * nz + j]);
      im[j] = K.Ki ? K.Ki[i * nz + j] + f * (K.Ki[(i + 1) * nz + j] - K.Ki[i * nz + j]) : 0;
    }
    return { z: K.z_um, re: re, im: im };
  }
  function depthTable(info, q) {
    need(info && info.kernel && info.cell_z_um, "the movie lacks its optical kernel");
    const zlo = info.cell_z_um[0], zhi = info.cell_z_um[1], Lz = zhi - zlo;
    const Kq = kernelAt(info, q), zg = Kq.z, nzg = zg.length;
    const nz = Math.min(1500, Math.max(200, Math.ceil(Lz / 0.05))), dz = Lz / nz;
    const kr = new Float64Array(nz), ki = new Float64Array(nz);
    let j = 0;
    for (let k = 0; k < nz; k++) {
      const z = zlo + (k + 0.5) * dz;
      while (j < nzg - 2 && zg[j + 1] < z) j++;
      const f = Math.max(0, Math.min(1, (z - zg[j]) / (zg[j + 1] - zg[j])));
      kr[k] = Kq.re[j] + f * (Kq.re[j + 1] - Kq.re[j]); ki[k] = Kq.im[j] + f * (Kq.im[j + 1] - Kq.im[j]);
    }
    let n0 = 0; for (let k = 0; k < nz; k++) n0 += kr[k] * kr[k] + ki[k] * ki[k];
    need(n0 > 0, "the optical kernel is zero at q = " + q.toFixed(3));
    // Re C on dz steps over one period 2 Lz (mirror images of the cell)
    const C = new Float64Array(2 * nz);
    for (let d = 0; d < 2 * nz; d++) {
      let sr = 0;
      for (let k = 0; k < nz; k++) { let m = (k + d) % (2 * nz); if (m >= nz) m = 2 * nz - 1 - m; sr += kr[k] * kr[m] + ki[k] * ki[m]; }
      C[d] = sr / n0;
    }
    const Cat = function (a) { a = Math.abs(a) / dz; a = a % (2 * nz); const i = Math.floor(a), f = a - i; return C[i] + f * (C[(i + 1) % (2 * nz)] - C[i]); };
    // h_q(s) on steps q ds = 0.2 (linear interpolation error about 0.5 %), up to q s = 60
    const ds = 0.2 / q, smax = 60 / q, ns = Math.ceil(smax / ds) + 1, h = new Float64Array(ns);
    h[0] = 1;
    for (let k = 1; k < ns; k++) {
      const sv = k * ds, na = Math.max(16, Math.min(4000, Math.ceil(sv / Math.min(dz, 0.1)))), da = sv / na;
      let acc = 0;
      for (let m = 0; m <= na; m++) { const a = m * da, w = m === 0 || m === na ? 0.5 : 1; acc += w * besselJ0(q * Math.sqrt(Math.max(0, sv * sv - a * a))) * Cat(a); }
      h[k] = acc * da / sv;
    }
    return { q: q, dz: dz, nz: nz, C: C, Cat: Cat, ds: ds, smax: smax, h: h };
  }
  const schulzGrid = new Map();
  function speedGrid(spread) {        // nodes u = v / vmean and weights of a Schulz distribution of relative SD spread
    const key = spread.toPrecision(5); if (schulzGrid.has(key)) return schulzGrid.get(key);
    const Z = shapeOf(spread), n = 120, lo = Math.max(0, 1 - 8 * spread), hi = 1 + 10 * spread, du = (hi - lo) / (n - 1);
    const u = new Float64Array(n), w = new Float64Array(n); let W = 0;
    for (let i = 0; i < n; i++) u[i] = lo + i * du;
    let mx = -Infinity; for (let i = 0; i < n; i++) if (u[i] > 0) mx = Math.max(mx, Z * Math.log(u[i]) - (Z + 1) * u[i]);
    W = 0; for (let i = 0; i < n; i++) { w[i] = u[i] > 0 ? Math.exp(Z * Math.log(u[i]) - (Z + 1) * u[i] - mx) : 0; W += w[i]; }
    for (let i = 0; i < n; i++) w[i] /= W;
    const out = { u: u, w: w }; if (schulzGrid.size > 500) schulzGrid.clear(); schulzGrid.set(key, out); return out;
  }
  function depthF(tb, t, p) {
    const g = speedGrid(p.spread), q = tb.q;
    let sw = 0;
    for (let i = 0; i < g.u.length; i++) {
      if (g.w[i] === 0) continue;
      const s = p.v * g.u[i] * t / tb.ds; if (s >= tb.h.length - 1) continue;
      const k = Math.floor(s), f = s - k; sw += g.w[i] * (tb.h[k] + f * (tb.h[k + 1] - tb.h[k]));
    }
    // still particles: axial diffusion through the depth response (Gaussian step of variance 2 D t)
    const sg = Math.sqrt(2 * p.D * t);
    let still;
    if (sg < 0.5 * tb.dz) still = 1;
    else { const nn = Math.max(8, Math.ceil(4 * sg / tb.dz)), da = 4 * sg / nn; let acc = 0, wsum = 0; for (let m = -nn; m <= nn; m++) { const a = m * da, w = Math.exp(-0.5 * a * a / (sg * sg)); acc += w * tb.Cat(a); wsum += w; } still = acc / wsum; }
    return Math.exp(-p.D * q * q * t) * ((1 - p.alpha) * still * stillTurn(p, t) + p.alpha * sw);
  }

  // best A, B for d = A (1 - f) + B (linear least squares, weights 1)
  function linAB(y, f) {
    let s0 = 0, s1 = 0, s11 = 0, sy = 0, s1y = 0; const L = y.length;
    for (let i = 0; i < L; i++) { const g = 1 - f[i]; s0++; s1 += g; s11 += g * g; sy += y[i]; s1y += g * y[i]; }
    const det = s0 * s11 - s1 * s1; if (!(Math.abs(det) > 1e-300)) return null;
    const A = (s0 * s1y - s1 * sy) / det, B = (sy - A * s1) / s0;
    return { A: A, B: B };
  }

  // per-q compressed exponential: d = A (1 - exp(-(G t)^beta)) + B (beta free, or fixed when given)
  function fitCompressed(taus, y, A0, B0, betaFix) {
    const L = taus.length;
    let G0 = null; for (let i = 0; i < L; i++) { const f = 1 - (y[i] - B0) / A0; if (f < Math.exp(-1)) { G0 = 1 / taus[i]; break; } }
    if (G0 === null) G0 = 0.5 / taus[L - 1];
    const scale = Math.max(A0 + B0, 1e-300), free = betaFix === null || betaFix === undefined;
    const model = function (p, t) { const be = free ? p[3] : betaFix; return Math.exp(p[0]) * (1 - Math.exp(-Math.pow(Math.exp(p[2]) * t, be))) + p[1] * scale; };
    const resid = function (p) { const r = new Float64Array(L); for (let i = 0; i < L; i++) r[i] = (model(p, taus[i]) - y[i]) / scale; return r; };
    const p0 = [Math.log(Math.max(A0, 1e-300)), B0 / scale, Math.log(G0)]; if (free) p0.push(1.3);
    const clamp = function (p) { if (free) p[3] = Math.min(3, Math.max(0.3, p[3])); return p; };
    const r = DDM.lm(resid, p0, clamp);
    const p = r.p;
    let se = Infinity; if (r.cov && r.cov[2][2] > 0) se = Math.sqrt(r.cov[2][2]);
    return { A: Math.exp(p[0]), B: p[1] * scale, gamma_hz: Math.exp(p[2]), beta: free ? p[3] : betaFix, lnGamma_se: se, ok: Number.isFinite(p[2]) && Number.isFinite(se), cost: r.cost };
  }

  // global swimmer fit over the q in the window: shared v, alpha, spread, D; A and B per q by linear least squares
  // cells that do not swim: translation D (all q) and turning D_R (all q) with a share b of each pattern that depends
  // on the orientation, different at each q (it grows with q):
  //   d = A [1 - e^(-D q^2 t)] + A b e^(-D q^2 t) [1 - e^(-6 D_R t)] + B,  linear in A, A b, B for given D, D_R
  function stillRow(r, taus, D, Dr, g1, g2) {
    const L = taus.length, q2 = r.q * r.q;
    for (let i = 0; i < L; i++) { const e = Math.exp(-D * q2 * taus[i]); g1[i] = 1 - e; g2[i] = e * (1 - Math.exp(-6 * Dr * taus[i])); }
    // least squares in (c1, c2, B); c2 kept in [0, c1] (b between 0 and 1), A within the bounds of boundAB
    let s11 = 0, s12 = 0, s22 = 0, s1 = 0, s2 = 0, sy = 0, s1y = 0, s2y = 0;
    for (let i = 0; i < L; i++) { s11 += g1[i] * g1[i]; s12 += g1[i] * g2[i]; s22 += g2[i] * g2[i]; s1 += g1[i]; s2 += g2[i]; sy += r.y[i]; s1y += g1[i] * r.y[i]; s2y += g2[i] * r.y[i]; }
    const solve3 = function () {
      const M = [[s11, s12, s1], [s12, s22, s2], [s1, s2, L]], v = [s1y, s2y, sy];
      const x = DDM.solve(M, v); return x ? { c1: x[0], c2: x[1], B: x[2] } : null;
    };
    const solve2 = function (c2fix) {   // c2 = c2fix * c1 (b fixed)
      let a11 = 0, a1 = 0, ay = 0; for (let i = 0; i < L; i++) { const g = g1[i] + c2fix * g2[i]; a11 += g * g; a1 += g; ay += g * r.y[i]; }
      const det = a11 * L - a1 * a1; if (Math.abs(det) < 1e-300) return null;
      const c1 = (ay * L - a1 * sy) / det, B = (sy - c1 * a1) / L; return { c1: c1, c2: c2fix * c1, B: B };
    };
    let x = solve3();
    if (!x || !(x.c1 > 0) || x.c2 < 0 || x.c2 > x.c1) { const a = solve2(0), b = solve2(1); const cost = function (z) { if (!z) return Infinity; let c = 0; for (let i = 0; i < L; i++) { const e = z.c1 * g1[i] + z.c2 * g2[i] + z.B - r.y[i]; c += e * e; } return c; }; x = cost(a) <= cost(b) ? a : b; }
    const hiA = r.Ahi > 0 ? Math.min(3 * r.scale, r.Ahi) : 3 * r.scale, loA = r.Alo > 0 ? Math.min(r.Alo, hiA) : 0;
    if (x && (x.c1 < loA || x.c1 > hiA)) { const bq = x.c1 > 0 ? Math.min(1, Math.max(0, x.c2 / x.c1)) : 0, c1 = Math.min(hiA, Math.max(loA, x.c1)); let sb = 0; for (let i = 0; i < L; i++) sb += r.y[i] - c1 * (g1[i] + bq * g2[i]); x = { c1: c1, c2: bq * c1, B: sb / L }; }
    return x;
  }
  function fitStill(taus, rows, start) {
    const L = taus.length, g1 = new Float64Array(L), g2 = new Float64Array(L);
    const resid = function (p) {
      const D = Math.exp(p[0]), Dr = Math.exp(p[1]), out = new Float64Array(rows.length * L);
      rows.forEach(function (r, j) { const x = stillRow(r, taus, D, Dr, g1, g2); for (let i = 0; i < L; i++) out[j * L + i] = x ? (x.c1 * g1[i] + x.c2 * g2[i] + x.B - r.y[i]) / r.scale : 1; });
      return out;
    };
    const clamp = function (p) {
      p[0] = Math.min(Math.log(D_LIMITS ? D_LIMITS[1] : 1e3), Math.max(Math.log(D_LIMITS ? D_LIMITS[0] : 1e-5), p[0]));
      p[1] = Math.min(Math.log(100), Math.max(Math.log(1e-3), p[1])); return p;
    };
    let best = null;
    for (const dr0 of [start.Dr || 0.3, 3 * (start.Dr || 0.3)]) {
      const r = DDM.lm(resid, [Math.log(Math.max(1e-4, start.D)), Math.log(dr0)], clamp);
      if (best === null || r.cost < best.cost) best = r;
    }
    const D = Math.exp(best.p[0]), Dr = Math.exp(best.p[1]);
    const se = function (i) { return best.cov && best.cov[i][i] > 0 ? Math.sqrt(best.cov[i][i]) : null; };
    const ab = rows.map(function (r) { const x = stillRow(r, taus, D, Dr, g1, g2); return x ? { A: x.c1, B: x.B, b: x.c1 > 0 ? x.c2 / x.c1 : 0 } : { A: r.A, B: r.B, b: 0 }; });
    const bm = ab.reduce(function (s, x) { return s + x.b; }, 0) / Math.max(1, ab.length);
    return { kind: "still", v_um_s: start.v, alpha: 0, spread: start.spread, D_um2_s: D, turn_share: bm, D_r_s: Dr, cost: best.cost, n_points: rows.length * L,
             D_rel_err: se(0), D_r_rel_err: se(1), ab: ab, stroke_um: 0, stroke_hz: 0 };
  }
  // limits on D while one analysis runs: within a factor 5 of the value expected from the cells, when it is known
  // (a free D otherwise runs off to tens of um^2/s to mimic swimmers that the model describes badly)
  let D_LIMITS = null;
  function fitSwimGlobal(kind, taus, rows, start, fixed) {
    const L = taus.length;
    // kind: "3d" or "2d" (closed models), or "depth" (3D swimmers seen through the depth response of the microscope;
    // every row then carries its table, see depthTable)
    const fm = kind === "depth" ? function (r, t, p) { return depthF(r.depth, t, p); } : function (r, t, p) { return swimF(kind, r.q, t, p); };
    // parameters: ln v, alpha, spread, ln D, turning (b, ln D_R), stroke (ln A, ln f, model "stroke" only); fixed ones
    // are left out of the fit
    if (kind !== "stroke" && kind !== "strokex") fixed = Object.assign({ A: 0, f: 0 }, fixed);
    const names = ["v", "alpha", "spread", "D", "b", "Dr", "A", "f"], free = names.filter(function (k) { return fixed[k] === undefined; });
    const toP = { v: Math.log(start.v), alpha: start.alpha, spread: start.spread, D: Math.log(Math.max(start.D, 1e-4)), b: start.b === undefined ? 0.5 : start.b, Dr: Math.log(start.Dr === undefined ? 0.2 : Math.max(1e-3, start.Dr)),
                  A: Math.log(Math.max(0.01, start.A || 1)), f: Math.log(Math.max(0.1, start.f || 10)) };
    const LOGS = { v: 1, D: 1, Dr: 1, A: 1, f: 1 };
    const unpack = function (p) {
      const o = {}; names.forEach(function (k) { o[k] = fixed[k] !== undefined ? fixed[k] : null; });
      free.forEach(function (k, i) { o[k] = LOGS[k] ? Math.exp(p[i]) : p[i]; });
      return o;
    };
    const fbuf = new Float64Array(L);
    const resid = function (p) {
      const par = unpack(p), out = new Float64Array(rows.length * L);
      rows.forEach(function (r, j) {
        for (let i = 0; i < L; i++) fbuf[i] = fm(r, taus[i], par);
        const ab = boundAB(r, fbuf);
        for (let i = 0; i < L; i++) out[j * L + i] = (ab.A * (1 - fbuf[i]) + ab.B - r.y[i]) / r.scale;
      });
      return out;
    };
    const clamp = function (p) {
      free.forEach(function (k, i) {
        if (k === "alpha") p[i] = Math.min(1, Math.max(0, p[i]));
        if (k === "spread") p[i] = Math.min(0.95, Math.max(kind === "stroke" || kind === "strokex" ? 0.1 : 0.05, p[i]));
        if (k === "D") p[i] = Math.min(Math.log(D_LIMITS ? D_LIMITS[1] : 1e3), Math.max(Math.log(D_LIMITS ? D_LIMITS[0] : 1e-5), p[i]));
        if (k === "b") p[i] = Math.min(1, Math.max(0, p[i]));
        if (k === "Dr") p[i] = Math.min(Math.log(100), Math.max(Math.log(1e-3), p[i]));
        if (k === "A") p[i] = Math.min(Math.log(50), Math.max(Math.log(0.01), p[i]));
        if (k === "f") p[i] = Math.min(Math.log(0.5 / (taus[0] || 1e-3)), Math.max(Math.log(0.1), p[i]));   // below the Nyquist frequency of the movie
      });
      return p;
    };
    const r = DDM.lm(resid, free.map(function (k) { return toP[k]; }), clamp);
    const par = unpack(r.p);
    const se = function (k) { const i = free.indexOf(k); return i >= 0 && r.cov && r.cov[i][i] > 0 ? Math.sqrt(r.cov[i][i]) : null; };
    const ab = rows.map(function (rw) { for (let i = 0; i < L; i++) fbuf[i] = fm(rw, taus[i], par); return boundAB(rw, fbuf); });
    return { kind: kind, v_um_s: par.v, alpha: par.alpha, spread: par.spread, D_um2_s: par.D, turn_share: par.b, D_r_s: par.Dr, stroke_um: par.A, stroke_hz: par.f, cost: r.cost, n_points: rows.length * L,
             v_rel_err: se("v"), alpha_err: se("alpha"), spread_err: se("spread"), D_rel_err: se("D"), stroke_rel_err: se("A"), stroke_hz_rel_err: se("f"), ab: ab };
  }

  // A and B of one q for a given f: least squares, with A kept between 0 and 3 times A + B = 2 var (the plateau the
  // data must reach); without the bound a model that hardly decays (f near 1) can mimic any rise with a huge A
  function boundAB(r, f) {
    let ab = linAB(r.y, f);
    const L = f.length, hiA = r.Ahi > 0 ? Math.min(3 * r.scale, r.Ahi) : 3 * r.scale, loA = r.Alo > 0 ? Math.min(r.Alo, hiA) : 0;
    if (ab === null || !(ab.A >= loA && ab.A <= hiA)) {
      const A = ab === null ? Math.max(loA, r.A) : Math.min(hiA, Math.max(loA, ab.A));
      let sb = 0; for (let i = 0; i < L; i++) sb += r.y[i] - A * (1 - f[i]);
      ab = { A: A, B: sb / L };
    }
    return ab;
  }
  // non-negative least squares (Lawson and Hanson) for min |M w - b|, M given by columns
  function nnls(cols, b, maxIt) {
    const n = cols.length, m = b.length, w = new Float64Array(n), P = new Uint8Array(n);
    const dot = function (x, y) { let s = 0; for (let i = 0; i < m; i++) s += x[i] * y[i]; return s; };
    const resid = function () { const r = Float64Array.from(b); for (let k = 0; k < n; k++) if (w[k] !== 0) { const c = cols[k]; for (let i = 0; i < m; i++) r[i] -= w[k] * c[i]; } return r; };
    const lsP = function () {   // unconstrained least squares on the passive set
      const idx = []; for (let k = 0; k < n; k++) if (P[k]) idx.push(k);
      const G = idx.map(function (a) { return idx.map(function (c) { return dot(cols[a], cols[c]); }); }), h = idx.map(function (a) { return dot(cols[a], b); });
      G.forEach(function (row, i) { row[i] += 1e-12 * (row[i] + 1e-300); });
      const z = DDM.solve(G, h); const out = new Float64Array(n); if (z) idx.forEach(function (k, i) { out[k] = z[i]; }); return out;
    };
    for (let it = 0; it < (maxIt || 3 * n); it++) {
      const r = resid(); let best = -1, gbest = 1e-12;
      for (let k = 0; k < n; k++) if (!P[k]) { const g = dot(cols[k], r); if (g > gbest) { gbest = g; best = k; } }
      if (best < 0) break;
      P[best] = 1;
      for (let inner = 0; inner < 3 * n; inner++) {
        const z = lsP(); let ok = true; for (let k = 0; k < n; k++) if (P[k] && z[k] <= 0) ok = false;
        if (ok) { for (let k = 0; k < n; k++) w[k] = P[k] ? z[k] : 0; break; }
        let alpha = Infinity; for (let k = 0; k < n; k++) if (P[k] && z[k] <= 0) alpha = Math.min(alpha, w[k] / (w[k] - z[k]));
        for (let k = 0; k < n; k++) if (P[k]) { w[k] += alpha * (z[k] - w[k]); if (w[k] <= 1e-15) { w[k] = 0; P[k] = 0; } }
      }
    }
    return w;
  }

  // P(v) by inversion of a fitted f(x) (x = q dt); speeds on a grid in units of um/s
  function invertCurve(fx, kind, vgrid) {
    // x grid: until f < 1e-7
    let xmax = 1; while (fx(xmax) > 1e-7 && xmax < 1e4) xmax *= 1.5;
    const nx = 6000, dx = xmax / nx, xs = new Float64Array(nx + 1), gs = new Float64Array(nx + 1);
    for (let i = 0; i <= nx; i++) { xs[i] = i * dx; gs[i] = xs[i] * fx(xs[i]); }
    return vgrid.map(function (v) {
      let s = 0;
      for (let i = 0; i <= nx; i++) { const k = kind === "2d" ? besselJ0(xs[i] * v) : Math.sin(xs[i] * v); s += (i === 0 || i === nx ? 0.5 : 1) * gs[i] * k; }
      s *= dx;
      return kind === "2d" ? v * s : 2 * v / Math.PI * s;
    });
  }

  /* opts: { q_min_per_um, q_max_per_um (null: automatic), beta (null: free, else fixed for the compressed fits),
   *         kind ("3d" | "2d": geometry assumed by the swimmer model and the inversions), images (as in ddm-engine) } */
  function* analyse(movie, opts) {
    const kind = opts.kind === "2d" ? "2d" : "3d";
    const S = yield* DDM.structure(movie, opts);
    const taus = S.taus_s, L = taus.length, nb = S.nb;
    yield { stage: "Fitting each q", frac: 0.9 };
    // per-q compressed fits (beta free, and with the fixed beta if asked)
    const betaFix = opts.beta === null || opts.beta === undefined ? null : opts.beta;
    // frames in bursts reach delays far beyond those of evenly spaced frames, where the slow step of the cells that do
    // not swim joins the fast one: one compressed exponential then follows neither. Its fits keep to the delays the same
    // frames evenly spaced would give (up to T/2 frame intervals; all delays when fewer than 8 are left)
    let Lc = L;
    if (S.pairs) { let k = 0; while (k < L && taus[k] <= (S.T / 2) * S.dt_s * (1 + 1e-9)) k++; if (k >= 8) Lc = k; }
    const tc = Lc < L ? taus.slice(0, Lc) : taus;
    const rows = [];
    for (let b = 1; b <= nb; b++) {
      if (!(S.nmodes[b] > 0)) continue;
      const y = new Float64Array(L); for (let i = 0; i < L; i++) y[i] = S.dq[i][b];
      let A0 = S.A_est[b], B0 = S.B_est[b]; if (!(A0 > 0)) A0 = Math.max(y[L - 1] - B0, 1e-12);
      const yc = Lc < L ? y.slice(0, Lc) : y;
      const cf = fitCompressed(tc, yc, A0, B0, null), cx = betaFix === null ? cf : fitCompressed(tc, yc, cf.A, cf.B, betaFix);
      // whole amplitude from the mean power (cells that stay put included), with the scatter of a few modes allowed for
      // (and at least that amplitude divided by the same margin: cells that stay put still count in the whole)
      const Atot = S.powq ? 2 * S.powq[b] - S.B_est[b] : NaN, kA = Math.max(1.3, 1 + 3 / Math.sqrt(Math.max(1, S.nmodes[b])));
      const Ahi = Atot > 0 ? Atot * kA : NaN, Alo = Atot > 0 && opts.amplitude_floor !== false ? Atot / kA : NaN;
      rows.push({ bin: b, q: S.q_per_um[b], y: y, A: cx.A, B: cx.B, scale: 2 * S.varq[b], Atot: Atot, Ahi: Ahi, Alo: Alo, free: cf, fixed: cx, gamma_hz: cx.gamma_hz, beta_free: cf.beta, lnGamma_se: cx.lnGamma_se, ok: cx.ok });
    }
    // window: measurable q, rates the movie can follow
    const qmin = opts.q_min_per_um === null || opts.q_min_per_um === undefined ? 0 : opts.q_min_per_um;
    const qmax = opts.q_max_per_um === null || opts.q_max_per_um === undefined ? Infinity : opts.q_max_per_um;
    for (const r of rows) {
      r.reason = null;
      if (r.q < 2 * S.q_lo_per_um) r.reason = "pattern as large as the image";
      else if (r.q > S.q_hi_per_um) r.reason = "finer than the microscope can see";
      else {
        // from the data, not from a fit (curves of swimmers mixed with still cells rise in two steps, which one
        // compressed exponential does not follow): signal above the noise, and part of the rise inside the movie
        const Aq = 2 * S.varq[r.bin] - S.B_est[r.bin], Bq = S.B_est[r.bin];
        if (!(Aq > 0.15 * Bq)) r.reason = "signal lost in camera noise";
        else if (r.y[0] - Bq > 0.75 * Aq) r.reason = "too fast for this frame rate";
        else if (r.y[L - 1] - Bq < 0.3 * Aq) r.reason = "too slow for this movie";
        else if (r.q < qmin || r.q > qmax) r.reason = "outside the chosen fit range";
      }
    }
    const used = rows.filter(function (r) { return r.reason === null; });
    // ballistic check: Gamma = v0 q (log fit, as the guide), slope of log Gamma vs log q, straight line Gamma = c + v q
    let comp = null;
    const usedC = used.filter(function (r) { return r.ok && r.lnGamma_se <= 0.3; });
    if (usedC.length >= 3) {
      let sl = 0, n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, lx = 0, ly = 0, lxx = 0, lxy = 0;
      for (const r of usedC) {
        sl += Math.log(r.gamma_hz / r.q); n++;
        sx += r.q; sy += r.gamma_hz; sxx += r.q * r.q; sxy += r.q * r.gamma_hz;
        const X = Math.log(r.q), Y = Math.log(r.gamma_hz); lx += X; ly += Y; lxx += X * X; lxy += X * Y;
      }
      const v0 = Math.exp(sl / n), vlin = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - vlin * sx) / n;
      const slope = (n * lxy - lx * ly) / (n * lxx - lx * lx);
      let sres = 0; for (const r of usedC) sres += Math.pow(Math.log(r.gamma_hz / r.q) - sl / n, 2);
      const v0_rel_err = Math.sqrt(sres / Math.max(1, n - 1) / n);
      const bmean = usedC.reduce(function (s, r) { return s + r.beta_free; }, 0) / n;
      comp = { v0_um_s: v0, v0_rel_err: v0_rel_err, slope: slope, v_line_um_s: vlin, intercept_hz: c, beta_free_mean: bmean, beta: betaFix, n_points: n };
    }
    // rods (known to the experimenter from the images): the cells that do not swim also fade as they turn; free share b
    // and rate 6 D_R, shared by all q. Round cells: b = 0.
    const turns = opts.turns === true;   // off by default: it trades the share of swimmers against the turning (tests)
    // share of swimmers straight from the amplitudes, when the cells that do not swim stay put during the movie (their
    // expected D q^2 t below 0.3 at the largest q used) while the swimmers have long renewed their patterns: then the
    // curves alone cannot tell the share (a smaller share with a larger amplitude fits as well), but the plateau of
    // each curve over the whole amplitude from the mean power can
    const Dh = opts.D_hint > 0 ? opts.D_hint : opts.D_from_cells === true && movie.truth && movie.truth.D_um2_s > 0 ? movie.truth.D_um2_s : 0;
    D_LIMITS = Dh > 0 ? [Dh / 5, 5 * Dh] : null;
    let alphaDirect = null;
    if (Dh > 0 && used.length >= 3 && opts.share_from_amplitude !== false && S.pairs) {
      // frames in bursts: per q, the delays after the swimmers have renewed the pattern and before the others have
      // diffused far; there (d - B) / A = alpha + (1 - alpha) (1 - e), e = exp(-D q^2 t), so alpha = (p - 1 + e) / e
      // round cells only: rods also fade as they turn, and at the q where that is still small their image changes
      // mostly at their ends (step 6, "Long cells"), so the swimmers have not renewed the pattern yet
      let num = 0, den = 0, n = 0;
      for (const r of used) {
        if (!(r.Atot > 0) || (movie.truth && movie.truth.D_r_s > 0)) continue;
        const q2 = r.q * r.q, ii = [];
        for (let i = 0; i < L; i++) if (r.gamma_hz * taus[i] > 5 && Dh * q2 * taus[i] < 0.3) ii.push(i);
        if (!ii.length) continue;
        const use = ii.slice(-3); let p = 0, e = 0;
        for (const i of use) { p += (r.y[i] - S.B_est[r.bin]) / r.Atot; e += Math.exp(-Dh * q2 * taus[i]); }
        p /= use.length; e /= use.length;
        num += (p - 1 + e) / e * r.Atot; den += r.Atot; n++;
      }
      if (n >= 3 && den > 0) alphaDirect = Math.min(1, Math.max(0, num / den));
    } else if (Dh > 0 && used.length >= 3 && opts.share_from_amplitude !== false) {
      const tmax = taus[L - 1], qhi = used[used.length - 1].q;
      if (Dh * qhi * qhi * tmax < 0.3) {
        let num = 0, den = 0, n = 0;
        for (const r of used) {
          if (!(r.Atot > 0) || !(r.gamma_hz * tmax > 5)) continue;
          num += (r.y[L - 1] + r.y[L - 2] + r.y[L - 3]) / 3 - r.B; den += r.Atot; n++;
        }
        if (n >= 3 && den > 0) alphaDirect = Math.min(1, Math.max(0, num / den));
      }
    }
    const shareFix = alphaDirect !== null ? { alpha: alphaDirect } : {};
    const turnFix = Object.assign(turns ? {} : { b: 0, Dr: 0.2 }, shareFix);
    // global swimmer model: start from the compressed result
    yield { stage: "Fitting the swimmer model", frac: 0.94 };
    let swim = null;
    if (used.length >= 3 && comp) {
      // several starts (speeds around the compressed estimate, small and large swimming share); the best fit is kept
      let best = null;
      // v0 of the compressed fit is about the mean speed / 2.2 in 3D and / 1.7 in the plane (narrow speed distributions)
      for (const fv of [1.2, kind === "2d" ? 1.8 : 2.3, 3.5]) for (const a0 of [0.3, 0.8]) {
        const g = fitSwimGlobal(kind, taus, used, { v: comp.v0_um_s * fv, alpha: a0, spread: 0.3, D: 0.3, b: 0.5, Dr: 0.2 }, turnFix);
        if (best === null || g.cost < best.cost) best = g;
      }
      swim = best;
      // diffusion expected from the size of the cells and the viscosity (opts.D_hint, known to the experimenter): when
      // the data do not ask for another value, it is kept. Without it the share of swimmers can drift with a D near 0
      // (cells that do not swim then look frozen, and frozen cells add nothing to the changes in the movie)
      // (the page passes D_from_cells: the bulk value the simulation uses, which the experimenter computes the same way
      // from the size and shape of the cells and the viscosity)
      if (Dh > 0) {
        // first without turning; if that does not describe the data, with the turning of rods (b, D_R) free
        const st = { v: best.v_um_s, alpha: Math.max(0.05, best.alpha), spread: best.spread, D: Dh, b: 0.3, Dr: 0.3 };
        let g = fitSwimGlobal(kind, taus, used, st, Object.assign({ D: Dh }, turnFix));
        if (!(g.cost <= 1.03 * best.cost) && !turns) g = fitSwimGlobal(kind, taus, used, st, Object.assign({ D: Dh }, shareFix));
        if (g.cost <= 1.03 * best.cost) { g.D_fixed = true; g.cost_free_D = best.cost; swim = g; }
      }
      // cells that do not swim at all (rods also fade as they turn, share b at rate 6 D_R): if this describes the data
      // about as well, no swimming is found (the swimmer model alone mistakes the turning of still rods for slow swimmers)
      const still = fitStill(taus, used, { v: swim.v_um_s, spread: swim.spread, D: Dh > 0 ? Dh : 0.3, Dr: 0.3 });
      swim.cost_still = still.cost;
      // also when the swimmer fit itself finds next to no swimmers, or a small share of "swimmers" whose rates hardly grow
      // with q (log-log slope under 0.5: rods that turn, not cells that swim)
      // (or "swimmers" far faster than any rate in the data: v above 15 v0 of the compressed fits)
      if (still.cost <= 1.1 * swim.cost || swim.alpha < 0.05 || (comp.slope < 0.5 && swim.alpha < 0.3) || swim.v_um_s > 15 * comp.v0_um_s || swim.v_um_s < 0.3 * comp.v0_um_s) { still.no_swim = true; still.cost_swim = swim.cost; still.perq = []; swim = still; }
      // per-q speed and fraction with spread and D fixed: the speed should not depend on q
      if (!swim.no_swim) swim.perq = used.map(function (r) {
        const g = fitSwimGlobal(kind, taus, [r], { v: swim.v_um_s, alpha: swim.alpha, spread: swim.spread, D: swim.D_um2_s }, { spread: swim.spread, D: swim.D_um2_s, b: swim.turn_share, Dr: swim.D_r_s });
        return { q: r.q, v_um_s: g.v_um_s, alpha: g.alpha };
      });
    }
    // 3D swimmers seen through the depth response of the microscope (when asked and the movie carries its optics)
    let swimDepth = null;
    if (swim && !swim.no_swim && kind === "3d" && opts.depth === true && movie.info && movie.info.kernel) {
      yield { stage: "Depth response of the microscope", frac: 0.95 };
      used.forEach(function (r) { r.depth = depthTable(movie.info, r.q); });
      let best = null;
      for (const st of [{ v: swim.v_um_s, alpha: swim.alpha }, { v: 0.8 * swim.v_um_s, alpha: Math.min(1, swim.alpha + 0.1) }]) {
        const g = fitSwimGlobal("depth", taus, used, { v: st.v, alpha: st.alpha, spread: swim.spread, D: swim.D_um2_s, b: swim.turn_share, Dr: swim.D_r_s }, turnFix);
        if (best === null || g.cost < best.cost) best = g;
      }
      swimDepth = best;
      swimDepth.perq = used.map(function (r) {
        const g = fitSwimGlobal("depth", taus, [r], { v: best.v_um_s, alpha: best.alpha, spread: best.spread, D: best.D_um2_s }, { spread: best.spread, D: best.D_um2_s, b: best.turn_share, Dr: best.D_r_s });
        return { q: r.q, v_um_s: g.v_um_s, alpha: g.alpha };
      });
    }
    // 3D swimmers with a stroke (opts.stroke): the cost on a grid of stroke frequencies and amplitudes with the rest from
    // the straight model, then a full fit from the best point (the cost has many local minima in f)
    let swimStrokeFit = null;
    const sk = opts.stroke_dir === "across" ? "strokex" : "stroke";   // stroke along the axis or across it
    if (swim && !swim.no_swim && kind === "3d" && opts.stroke === true && !swimDepth) {
      yield { stage: "Fitting the stroke", frac: 0.955 };
      // D: the value expected from the cells when given (the straight model may have bent it to mimic the stroke)
      const Dst = Dh > 0 ? Dh : swim.D_um2_s;
      const base = { v: swim.v_um_s, alpha: swim.alpha, spread: swim.spread, D: Dst, b: swim.turn_share, Dr: swim.D_r_s };
      const fb = new Float64Array(L);
      const costAt = function (par) {
        let c = 0;
        for (const r of used) { for (let i = 0; i < L; i++) fb[i] = swimF(sk, r.q, taus[i], par); const ab = boundAB(r, fb); for (let i = 0; i < L; i++) { const e = (ab.A * (1 - fb[i]) + ab.B - r.y[i]) / r.scale; c += e * e; } }
        return c;
      };
      const fNyq = 0.5 / taus[0];
      let bestP = null, bestC = Infinity;
      const sub = used.filter(function (r, j) { return j % 3 === 1; });   // the grid on a third of the q is enough to find the valley
      const costSub = function (par) { let c = 0; for (const r of sub) { for (let i = 0; i < L; i++) fb[i] = swimF(sk, r.q, taus[i], par); const ab = boundAB(r, fb); for (let i = 0; i < L; i++) { const e = (ab.A * (1 - fb[i]) + ab.B - r.y[i]) / r.scale; c += e * e; } } return c; };
      for (const fz of [2, 3, 5, 8, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 130, 160, 200]) {
        if (fz >= 0.9 * fNyq) continue;
        for (const Az of [0.3, 0.7, 1.5, 3, 6, 12]) for (const a0 of [base.alpha, 0.95]) for (const vf of [1, 1.15]) {
          const par = Object.assign({}, base, { A: Az, f: fz, alpha: a0, v: base.v * vf }), c = sub.length ? costSub(par) : costAt(par);
          if (c < bestC) { bestC = c; bestP = par; }
        }
      }
      if (bestP) {
        // fitted on every other q (the stroke model is slow), with D from the straight model; compared on all q
        const fixS = Object.assign({ D: Dst }, turnFix), half = used.filter(function (r, j) { return j % 2 === 0; });
        const g = fitSwimGlobal(sk, taus, half.length >= 3 ? half : used, bestP, fixS);
        g.cost = costAt({ v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz });
        g.ab = used.map(function (r) { for (let i = 0; i < L; i++) fb[i] = swimF(sk, r.q, taus[i], { v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz }); return boundAB(r, fb); });
        if (g.cost < swim.cost) {
          if (swim.D_fixed) g.D_fixed = true;
          g.perq = used.map(function (r) {
            const h = fitSwimGlobal(sk, taus, [r], { v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, A: g.stroke_um, f: g.stroke_hz }, { spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz });
            return { q: r.q, v_um_s: h.v_um_s, alpha: h.alpha };
          });
          swimStrokeFit = g;
        }
      }
    }
    // amplitude and noise used to normalise f(q, dt): from the swimmer fit (it has the slow part of the particles that
    // do not swim), else from the compressed fits
    const head = swimDepth || swimStrokeFit || swim;
    used.forEach(function (r, j) { const ab = head && head.ab[j] && head.ab[j].A > 0 ? head.ab[j] : null; r.An = ab ? ab.A : r.A; r.Bn = ab ? ab.B : r.B; });
    // speed distributions
    yield { stage: "Speed distribution", frac: 0.97 };
    let pv = null;
    if (comp) {
      const vref = head ? head.v_um_s : comp.v0_um_s, vmax = 3 * vref, nv = 60, dv = vmax / nv;
      const vgrid = []; for (let k = 0; k <= nv; k++) vgrid.push(k * dv);
      const beta = betaFix !== null ? betaFix : comp.beta_free_mean, v0 = comp.v0_um_s;
      const fromCurve = invertCurve(function (x) { return Math.exp(-Math.pow(v0 * x, beta)); }, kind, vgrid);
      // from the data: columns = kernel of each speed bin (bin 0 = particles that do not swim)
      const D = head ? head.D_um2_s : 0;
      const pts = []; for (const r of used) for (let i = 0; i < L; i++) { const f = 1 - (r.y[i] - r.Bn) / r.An; if (f > -0.2 && f < 1.2) pts.push({ q: r.q, t: taus[i], f: f }); }
      const m = pts.length, cols = [];
      for (let k = 0; k <= nv; k++) {
        const col = new Float64Array(m + nv);
        for (let i = 0; i < m; i++) { const p = pts[i], X = p.q * p.t * vgrid[k]; col[i] = Math.exp(-D * p.q * p.q * p.t) * (k === 0 ? (head ? stillTurn({ b: head.turn_share, Dr: head.D_r_s }, p.t) : 1) : (kind === "2d" ? besselJ0(X) : Math.sin(X) / X)); }
        cols.push(col);
      }
      // curvature penalty on the swimming bins (not on the bin at v = 0)
      let tr = 0; cols.forEach(function (c) { for (let i = 0; i < m; i++) tr += c[i] * c[i]; });
      const lam = Math.sqrt(2e-4 * tr / (nv + 1));
      for (let j = 1; j < nv; j++) { if (j - 1 >= 1) cols[j - 1][m + j] += lam; cols[j][m + j] -= 2 * lam; cols[j + 1][m + j] += lam; }
      const bvec = new Float64Array(m + nv); for (let i = 0; i < m; i++) bvec[i] = pts[i].f;
      const w = nnls(cols, bvec);
      const W = w.reduce(function (s, x) { return s + x; }, 0) || 1;
      const fromData = Array.from(w, function (x) { return x / W; });
      let mean = 0, sw = 0; for (let k = 1; k <= nv; k++) { mean += fromData[k] * vgrid[k]; sw += fromData[k]; }
      pv = { kind: kind, v_um_s: vgrid, dv: dv, from_curve: fromCurve, from_data: fromData, data_still_share: fromData[0], data_mean_swimmers_um_s: sw > 0 ? mean / sw : null, curve_beta: beta, curve_v0: v0, n_points: m };
    }
    // master curve: f against q dt for the used q
    const master = used.map(function (r) { const f = new Float64Array(L); for (let i = 0; i < L; i++) f[i] = 1 - (r.y[i] - r.Bn) / r.An; return { q: r.q, f: f, A: r.An, B: r.Bn }; });
    // per q, for the page: amplitude and noise, the compressed rate, and the model curve d(dt) (the headline swimmer
    // model where the q is used, the compressed exponential elsewhere)
    const fits = rows.map(function (r) {
      const curve = new Float64Array(L), u = r.reason === null && head;
      if (u) { const jj = used.indexOf(r), bq = head.kind === "still" && head.ab[jj] ? head.ab[jj].b : head.turn_share;
               const par = { v: head.v_um_s, alpha: head.alpha, spread: head.spread, D: head.D_um2_s, b: bq, Dr: head.D_r_s, A: head.stroke_um, f: head.stroke_hz }; for (let i = 0; i < L; i++) curve[i] = r.An * (1 - (head === swimDepth ? depthF(r.depth, taus[i], par) : swimF(head === swimStrokeFit ? sk : kind, r.q, taus[i], par))) + r.Bn; }
      else for (let i = 0; i < L; i++) curve[i] = r.A * (1 - Math.exp(-Math.pow(r.gamma_hz * taus[i], r.fixed.beta))) + r.B;
      return { bin: r.bin, q_per_um: r.q, ok: r.ok, reason: r.reason, A: u ? r.An : r.A, B: u ? r.Bn : r.B, gamma_hz: r.gamma_hz, beta: r.fixed.beta, beta_free: r.beta_free, lnGamma_se: r.lnGamma_se, curve: curve };
    });
    D_LIMITS = null;
    return { kind: kind, model: head === swimDepth && swimDepth ? "depth" : head === swimStrokeFit && swimStrokeFit ? "stroke" : kind, lags: S.lags, pairs: S.pairs, times_s: S.times_s, taus_s: taus, q_per_um: S.q_per_um, dq: S.dq, d2d: S.d2d, varq: S.varq, B_floor: S.B_floor, B_est: S.B_est, A_est: S.A_est,
             fits: fits, share_from_amplitude: alphaDirect, head: head ? { no_swim: head.no_swim === true, D_fixed: head.D_fixed === true, v_um_s: head.no_swim ? null : head.v_um_s, alpha: head.alpha, spread: head.spread, D_um2_s: head.D_um2_s, turn_share: head.turn_share, D_r_s: head.D_r_s, v_rel_err: head.v_rel_err, alpha_err: head.alpha_err, spread_err: head.spread_err, stroke_um: head === swimStrokeFit ? head.stroke_um : null, stroke_hz: head === swimStrokeFit ? head.stroke_hz : null, perq: head.perq } : null,
             window: { q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um, q_opt_per_um: S.q_opt_per_um, q_nyq_per_um: S.q_nyq_per_um, gamma_lo_hz: S.gamma_lo_hz, gamma_hi_hz: S.gamma_hi_hz },
             rows: rows.map(function (r) { return { bin: r.bin, q_per_um: r.q, A: r.A, B: r.B, gamma_hz: r.gamma_hz, beta_free: r.beta_free, gamma_free_hz: r.free.gamma_hz, lnGamma_se: r.lnGamma_se, reason: r.reason }; }),
             compressed: comp, swim: strip(swim), swim_depth: strip(swimDepth), swim_stroke: strip(swimStrokeFit), pv: pv, master: master };
  }

  function strip(g) { if (!g) return null; const o = Object.assign({}, g); delete o.ab; if (o.no_swim) o.v_um_s = null; return o; }
  // compact result for repeated measurements
  function summary(r, mv) {
    const h = r.head, used = r.fits.filter(function (f) { return f.reason === null; }).map(function (f) { return f.q_per_um; });
    return { v: h ? h.v_um_s : null, alpha: h ? h.alpha : null, spread: h ? h.spread : null, D: h ? h.D_um2_s : null, v0: r.compressed ? r.compressed.v0_um_s : null, qs: used, seen: seenOver(mv.truth.swim, used), truth_v: mv.truth.swim ? mv.truth.swim.v_mean_um_s : null };
  }
  // truth as seen over the q used: share of the signal from swimmers and their mean speed, averaged over the used q
  function seenOver(truthSwim, qs) {
    const tab = truthSwim && truthSwim.seen_table; if (!tab || !qs.length) return null;
    const at = function (arr, q) { const qq = tab.q_per_um, n = qq.length; const t = Math.min(n - 2, Math.max(0, q / qq[n - 2] * (n - 2))), i = Math.floor(t), f = t - i; const a = arr[i], b = arr[i + 1]; return a === null || b === null ? (a === null ? b : a) : a + f * (b - a); };
    let fs = 0, vs = 0, nv = 0; qs.forEach(function (q) { fs += at(tab.fraction, q); const v = at(tab.v_mean_um_s, q); if (v !== null) { vs += v; nv++; } });
    return { fraction: fs / qs.length, v_mean_um_s: nv ? vs / nv : null };
  }

  const api = { fitStill: fitStill, summary: summary, depthTable: depthTable, depthF: depthF, seenOver: seenOver, analyse: analyse, swimF: swimF, swim3: swim3, swim2: swim2, besselJ0: besselJ0, nnls: nnls, invertCurve: invertCurve, fitSwimGlobal: fitSwimGlobal, fitCompressed: fitCompressed, linAB: linAB };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ACTIVE = api;
})(this);
