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
  /* Elongated swimmers swim along their axis. The image of a cell at wave vector q depends on the angle between q and
   * the axis: for a cylinder of length L and radius R lying along u (q in the image plane, so the image is the body seen
   * at q_z = 0, the blur of the optics being the same for every direction), |F|^2 = sinc^2(q mu L / 2) [2 J1(x) / x]^2,
   * x = q R sqrt(1 - mu^2), mu = cos(q, u). A swimmer moves along u, so q.dr = q v t mu, and the swimmers are weighted
   * by |F|^2 of their own direction:
   *   S = int dmu w(mu) <cos(q v t mu)>_v / int dmu w(mu),  <cos(k v)>_v = (1 + L^2)^(-(Z+1)/2) cos((Z+1) atan L), L = k vmean / (Z+1)
   * mu uniform on [0, 1] for 3D swimmers, mu = cos(phi) with phi uniform for swimmers in the plane. For w = 1 this is
   * Wilson's sin(X)/X (3D) or J0 (2D). Point-like cells (q L small) give w = 1. Used when the size of the cells is known
   * (opts.cell_length_um, opts.cell_width_um, or the cells of the movie when D_from_cells). */
  let SHAPE = null;
  const shapeCache = new Map();
  function besselJ1(x) {
    const ax = Math.abs(x);
    if (ax < 8) {
      const y = x * x;
      const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606))))));
      const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
      return a / b;
    }
    const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
    const a = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
    const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
    const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
    return x < 0 ? -ans : ans;
  }
  // Gauss-Legendre nodes and weights on [0, 1]
  const glCache = new Map();
  function gaussLegendre(n) {
    if (glCache.has(n)) return glCache.get(n);
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp = 0;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0; for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = n * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break;
      }
      x[i] = (1 - z) / 2; w[i] = 1 / ((1 - z * z) * pp * pp);    // on [0, 1]: (1 + t)/2 with t = -z, weight 2/((1-z^2) p'^2) / 2
    }
    const out = { x: x, w: w }; glCache.set(n, out); return out;
  }
  // weights of the swimmers by direction at one q (null when the cell is short against the pattern: Wilson's closed forms)
  // the movie module (for the image of one cell, MOVIE.particleTerms)
  function movieApi() { return typeof module !== "undefined" && module.exports ? require("./movie.js") : root.MOVIE; }
  // kernel K(q, z) of one block of the movie at q (linear in q between the tabulated values)
  function kernelBlockAt(K, qk, q) {
    const nq = qk.length, nz = K.z_um.length;
    const tq = Math.min(nq - 2, Math.max(0, q / qk[nq - 2] * (nq - 2))), i = Math.floor(tq), f = tq - i;
    const re = new Float64Array(nz), im = new Float64Array(nz);
    for (let j = 0; j < nz; j++) {
      re[j] = K.Kr[i * nz + j] + f * (K.Kr[(i + 1) * nz + j] - K.Kr[i * nz + j]);
      im[j] = K.Ki ? K.Ki[i * nz + j] + f * (K.Ki[(i + 1) * nz + j] - K.Ki[i * nz + j]) : 0;
    }
    return { z: K.z_um, re: re, im: im };
  }
  /* Image of one cell from the optics of the microscope (OPTICS: { info, kind, zs }): for each orientation u of the cell
   * and each depth z of its centre, F(q, u, z) = sum over its points of [w_het K_het(q, z + z_p) + w_hom K_hom(q, z + z_p)]
   * exp(-i q x_p), with the points and weights of the movie (MOVIE.particleTerms) and its kernels; q along x. The weight
   * of a swimmer is <|F|^2> over the depths of the cells, binned by |mu| = |q.u| / q (64 bins). This holds the shape
   * of the cell, how its brightness changes with its tilt, and how a thick cell looks through the optics. Also kept: F at
   * every orientation (depth-averaged |F|^2 and the complex F at each depth) for the turning of still cells. */
  let OPTICS = null;
  const opticsCache = new Map();
  function opticsAt(q) {
    const key = q.toPrecision(6); if (opticsCache.has(key)) return opticsCache.get(key);
    const O = OPTICS, info = O.info, M = movieApi();
    const chans = info.split && info.channels ? [{ K: info.channels.het, w: "het" }, { K: info.channels.hom, w: "hom" }] : [{ K: info.kernel, w: "all" }];
    const tabs = chans.filter(function (c) { return c.K; }).map(function (c) { return { t: kernelBlockAt(c.K, info.kernel_q, q), w: c.w }; });
    const interp = function (t, z) { const zg = t.z, n = zg.length; if (z <= zg[0]) return [t.re[0], t.im[0]]; if (z >= zg[n - 1]) return [t.re[n - 1], t.im[n - 1]]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zg[m] <= z) lo = m; else hi = m; } const f = (z - zg[lo]) / (zg[hi] - zg[lo]); return [t.re[lo] + f * (t.re[hi] - t.re[lo]), t.im[lo] + f * (t.im[hi] - t.im[lo])]; };
    const us = O.orient, nu = us.length, zs = O.zs, nzs = zs.length;
    const W = new Float64Array(nu), Fr = new Float64Array(nu * nzs), Fi = new Float64Array(nu * nzs);
    for (let k = 0; k < nu; k++) {
      const u = us[k], terms = M.particleTerms(info, u.x, u.y, u.z);
      let s2 = 0;
      for (let iz = 0; iz < nzs; iz++) {
        let fr = 0, fi = 0;
        for (const p of terms) {
          const c = Math.cos(q * p.x), sn = -Math.sin(q * p.x);
          let kr = 0, ki = 0;
          for (const tb of tabs) { const v = interp(tb.t, zs[iz] + p.z), w = p[tb.w]; kr += w * v[0]; ki += w * v[1]; }
          fr += kr * c - ki * sn; fi += kr * sn + ki * c;
        }
        Fr[k * nzs + iz] = fr; Fi[k * nzs + iz] = fi; s2 += fr * fr + fi * fi;
      }
      W[k] = s2 / nzs;
    }
    // weight of each |mu| for the swimmers (orientations with the same |mu| summed)
    const byMu = new Map(); let tot = 0;
    for (let k = 0; k < nu; k++) { const m = Math.abs(us[k].x), key = m.toFixed(9); byMu.set(key, { mu: m, w: (byMu.has(key) ? byMu.get(key).w : 0) + us[k].w * W[k] }); tot += us[k].w * W[k]; }
    const list = Array.from(byMu.values()), mub = new Float64Array(list.length), wb = new Float64Array(list.length);
    list.forEach(function (e, i) { mub[i] = e.mu; wb[i] = tot > 0 ? e.w / tot : 1 / list.length; });
    const out = { mu: mub, w: wb, W: W, Fr: Fr, Fi: Fi };
    if (opticsCache.size > 400) opticsCache.clear();
    opticsCache.set(key, out); return out;
  }
  /* Straight swimmers seen through the optics, cells with their shape: h_q(s) for a path s = v t,
   *   h_q(s) = sum_u w_u < F(u, z) F*(u, z + s u_z) e^(-i q s u_x) >_z / sum_u w_u < |F(u, z)|^2 >_z
   * (z mirrored at the walls of the cell, as the swimmers bounce), and for still cells the axial correlation averaged
   * over orientations. Same table layout as depthTable, so depthF uses it. */
  function opticsTable(q) {
    const O = OPTICS, info = O.info, M = movieApi(), zr = info.cell_z_um, zlo = zr[0], zhi = zr[1], Lz = zhi - zlo;
    const chans = info.split && info.channels ? [{ K: info.channels.het, w: "het" }, { K: info.channels.hom, w: "hom" }] : [{ K: info.kernel, w: "all" }];
    const tabs = chans.filter(function (c) { return c.K; }).map(function (c) { return { t: kernelBlockAt(c.K, info.kernel_q, q), w: c.w }; });
    const interp = function (t, z) { const zg = t.z, n = zg.length; if (z <= zg[0]) return [t.re[0], t.im[0]]; if (z >= zg[n - 1]) return [t.re[n - 1], t.im[n - 1]]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zg[m] <= z) lo = m; else hi = m; } const f = (z - zg[lo]) / (zg[hi] - zg[lo]); return [t.re[lo] + f * (t.re[hi] - t.re[lo]), t.im[lo] + f * (t.im[hi] - t.im[lo])]; };
    // orientations: polar axis along q (x), mu = u.x on 32 Gauss-Legendre nodes over [-1, 1] (a swimmer moves along u),
    // 12 azimuths over half a turn around q (the image is the same for u_y and -u_y)
    const G = gaussLegendre(32), us = [];
    for (let a = 0; a < 32; a++) { const mu = 2 * G.x[a] - 1, sm = Math.sqrt(1 - mu * mu); for (let k = 0; k < 12; k++) { const ph = Math.PI * ((k + 0.5) / 12 - 0.5); us.push({ x: mu, y: sm * Math.cos(ph), z: sm * Math.sin(ph), w: G.w[a] / 12 }); } }
    const nz = 32, dz = Lz / nz, zc = new Float64Array(nz); for (let j = 0; j < nz; j++) zc[j] = zlo + (j + 0.5) * dz;
    const nu = us.length, Fr = new Float64Array(nu * nz), Fi = new Float64Array(nu * nz), W = new Float64Array(nu);
    for (let k = 0; k < nu; k++) {
      const terms = M.particleTerms(info, us[k].x, us[k].y, us[k].z);
      for (let j = 0; j < nz; j++) {
        let fr = 0, fi = 0;
        for (const p of terms) { const c = Math.cos(q * p.x), sn = -Math.sin(q * p.x); let kr = 0, ki = 0; for (const tb of tabs) { const v = interp(tb.t, zc[j] + p.z), w = p[tb.w]; kr += w * v[0]; ki += w * v[1]; } fr += kr * c - ki * sn; fi += kr * sn + ki * c; }
        Fr[k * nz + j] = fr; Fi[k * nz + j] = fi; W[k] += (fr * fr + fi * fi) / nz;
      }
    }
    let n0 = 0; for (let k = 0; k < nu; k++) n0 += us[k].w * W[k];
    // F at a mirrored depth (linear between the grid points)
    const Fat = function (k, z) {
      let a = (z - zlo) % (2 * Lz); if (a < 0) a += 2 * Lz; if (a > Lz) a = 2 * Lz - a;
      const t = Math.max(0, Math.min(nz - 1, a / dz - 0.5)), j = Math.min(nz - 2, Math.floor(t)), f = t - j, o = k * nz;
      return [Fr[o + j] + f * (Fr[o + j + 1] - Fr[o + j]), Fi[o + j] + f * (Fi[o + j + 1] - Fi[o + j])];
    };
    const corr = function (k, dzz) { let sr = 0, si = 0; const o = k * nz; for (let j = 0; j < nz; j++) { const b = Fat(k, zc[j] + dzz), ar = Fr[o + j], ai = Fi[o + j]; sr += ar * b[0] + ai * b[1]; si += ai * b[0] - ar * b[1]; } return [sr / nz, si / nz]; };
    const ds = 0.2 / q, smax = 60 / q, ns = Math.ceil(smax / ds) + 1, h = new Float64Array(ns);
    for (let i = 0; i < ns; i++) {
      const sv = i * ds; let acc = 0;
      for (let k = 0; k < nu; k++) { const c = corr(k, sv * us[k].z), ph = q * sv * us[k].x; acc += us[k].w * (c[0] * Math.cos(ph) + c[1] * Math.sin(ph)); }
      h[i] = acc / n0;
    }
    // still cells: axial correlation averaged over orientations, on steps of dz over 2 Lz
    const C = new Float64Array(2 * nz);
    for (let d = 0; d < 2 * nz; d++) { let acc = 0; for (let k = 0; k < nu; k++) acc += us[k].w * corr(k, d * dz)[0]; C[d] = acc / n0; }
    const Cat = function (a) { a = Math.abs(a) / dz; a = a % (2 * nz); const i = Math.floor(a), f = a - i; return C[i] + f * (C[(i + 1) % (2 * nz)] - C[i]); };
    return { q: q, dz: dz, nz: nz, C: C, Cat: Cat, ds: ds, smax: smax, h: h, optics: true };
  }
  /* Fading of a cell's image as it turns, from the optics: the depth-averaged image F(u) of the cell at each orientation,
   * expanded in Legendre polynomials over the sphere (cells in 3D) or in Fourier modes over the angle (cells in the
   * plane): c_l = (2l+1)/(4 pi) sum_{u,u'} w w' <F(u) F*(u')>_z P_l(u.u') (normalised to sum 1). Under rotational
   * diffusion D_R the image correlation is sum_l c_l exp(-l(l+1) D_R t) (3D) or sum_m c_m exp(-m^2 D_R t) (plane).
   * c_0 is the part that does not depend on the orientation. */
  const turnCache = new Map();
  function turnSpec(q) {
    const key = q.toPrecision(6); if (turnCache.has(key)) return turnCache.get(key);
    const o = opticsAt(q), us = OPTICS.orient, nu = us.length, nz = OPTICS.zs.length, Lmax = 16, c = new Float64Array(Lmax + 1);
    if (OPTICS.kind === "2d") {
      for (let mm = 0; mm <= Lmax; mm++) {
        let acc = 0;
        for (let iz = 0; iz < nz; iz++) { let ar = 0, ai = 0; for (let k = 0; k < nu; k++) { const ph = Math.atan2(us[k].y, us[k].x) * mm, fr = o.Fr[k * nz + iz], fi = o.Fi[k * nz + iz]; ar += us[k].w * (fr * Math.cos(ph) + fi * Math.sin(ph)); ai += us[k].w * (fi * Math.cos(ph) - fr * Math.sin(ph)); } acc += ar * ar + ai * ai; }
        c[mm] = (mm === 0 ? 1 : 2) * acc / nz;
      }
    } else {
      const G = new Float64Array(nu * nu);
      for (let k = 0; k < nu; k++) for (let k2 = k; k2 < nu; k2++) { let g = 0; for (let iz = 0; iz < nz; iz++) g += o.Fr[k * nz + iz] * o.Fr[k2 * nz + iz] + o.Fi[k * nz + iz] * o.Fi[k2 * nz + iz]; G[k * nu + k2] = G[k2 * nu + k] = g / nz; }
      for (let k = 0; k < nu; k++) for (let k2 = 0; k2 < nu; k2++) {
        const x = us[k].x * us[k2].x + us[k].y * us[k2].y + us[k].z * us[k2].z, ww = us[k].w * us[k2].w * G[k * nu + k2];
        let p0 = 1, p1 = x; c[0] += ww; c[1] += 3 * ww * p1;
        for (let l = 2; l <= Lmax; l++) { const p2 = ((2 * l - 1) * x * p1 - (l - 1) * p0) / l; c[l] += (2 * l + 1) * ww * p2; p0 = p1; p1 = p2; }
      }
      // (the orientations cover half the sphere, mu >= 0; a rod looks the same from both ends, F(-u) = F(u), so over the
      // whole sphere the odd l cancel)
      for (let l = 1; l <= Lmax; l += 2) c[l] = 0;
    }
    let tot = 0; for (let l = 0; l <= Lmax; l++) { c[l] = Math.max(0, c[l]); tot += c[l]; }
    for (let l = 0; l <= Lmax; l++) c[l] = tot > 0 ? c[l] / tot : (l === 0 ? 1 : 0);
    const out = { c: c, plane: OPTICS.kind === "2d" };
    if (turnCache.size > 400) turnCache.clear();
    turnCache.set(key, out); return out;
  }
  // image correlation of a turning cell after t (1 at t = 0, c_0 for long times)
  function turnCorr(q, t, Dr) {
    const T = turnSpec(q), c = T.c; let s = c[0];
    for (let l = 1; l < c.length; l++) if (c[l] > 0) s += c[l] * Math.exp(-(T.plane ? l * l : l * (l + 1)) * Dr * t);
    return s;
  }
  function shapeWeights(q, kind) {
    if (OPTICS && OPTICS.weights) { const o = opticsAt(q); return { mu: o.mu, w: o.w }; }
    const key = kind + ":" + q.toPrecision(6);
    if (shapeCache.has(key)) return shapeCache.get(key);
    const L = SHAPE.L, R = SHAPE.R, aMax = q * L / 2, xMax = q * R;
    let out = null;
    if (aMax > 0.3 || xMax > 0.3) {
      const n = aMax < 2 ? 16 : aMax < 6 ? 24 : 40, G = gaussLegendre(n), mu = new Float64Array(n), w = new Float64Array(n);
      let W = 0;
      for (let k = 0; k < n; k++) {
        const c = G.x[k];                                       // mu (3D) or phi / (pi/2) (2D)
        const m = kind === "2d" ? Math.cos(c * Math.PI / 2) : c, a = q * m * L / 2, x = q * R * Math.sqrt(Math.max(0, 1 - m * m));
        const sl = Math.abs(a) < 1e-8 ? 1 : Math.sin(a) / a, tr = x < 1e-8 ? 1 : 2 * besselJ1(x) / x;
        mu[k] = m; w[k] = G.w[k] * sl * sl * tr * tr; W += w[k];
      }
      for (let k = 0; k < n; k++) w[k] /= W;
      out = { mu: mu, w: w };
    }
    if (shapeCache.size > 4000) shapeCache.clear();
    shapeCache.set(key, out); return out;
  }
  function swimShaped(W, X, Z) {
    if (X < 1e-8) return 1;
    let s = 0;
    for (let k = 0; k < W.mu.length; k++) { const L = X * W.mu[k] / (Z + 1); s += W.w[k] * Math.pow(1 + L * L, -(Z + 1) / 2) * Math.cos((Z + 1) * Math.atan(L)); }
    return s;
  }
  // turning share at the j-th used q of a fit: its own value when the fit has one per q, else the common one
  function bOf(g, j) { return (g.kind === "still" || g.turn_perq) && g.ab && g.ab[j] && g.ab[j].b !== undefined ? g.ab[j].b : g.turn_share; }
  // the pattern that depends on the orientation (to lowest order cos 2 theta) fades at l (l + 1) D_R = 6 D_R for rods that
  // turn in 3D, l^2 D_R = 4 D_R for rods that lie in the plane (2D analysis)
  let ROT = 6;
  // turning of the cells that do not swim: share b of the pattern fades; with the optics (and q) its time course is the
  // decaying part of turnCorr, else one exponential at 6 D_R (3D) or 4 D_R (plane)
  function stillTurn(p, t, q) {
    if (!p.b) return 1;
    if (OPTICS && q > 0) { const c0 = turnSpec(q).c[0], tc = turnCorr(q, t, p.Dr); return (1 - p.b) + p.b * (c0 < 0.999 ? (tc - c0) / (1 - c0) : Math.exp(-ROT * p.Dr * t)); }
    return (1 - p.b) + p.b * Math.exp(-ROT * p.Dr * t);
  }
  // turning of the swimmers themselves (rotational diffusion DRS of their heading): their image fades as they turn
  let DRS = 0, SWIM_DS_FREE = false, DS_MAX = 3;
  // the swimmers turn too (rotational diffusion D_s of their heading), and their images fade as those of the cells that
  // do not swim: the same share b of the pattern (it belongs to the image of a rod at that q), at rate 6 D_s
  function swimTurn(q, t, p) {
    const d = p && p.Ds > 0 ? p.Ds : DRS; if (!(d > 0) || !(q > 0)) return 1;
    if (OPTICS) return turnCorr(q, t, d);
    return p.b > 0 ? (1 - p.b) + p.b * Math.exp(-ROT * d * t) : 1;
  }
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
    const Z = shapeOf(p.spread), X = q * p.v * t, W = SHAPE && (kind === "3d" || kind === "2d") ? shapeWeights(q, kind) : null;
    const S = W ? swimShaped(W, X, Z) : kind === "2d" ? swim2(X, Z) : kind === "stroke" || kind === "strokex" ? swimStroke(q, t, p.v, Z, p.A, p.f, kind === "strokex") : swim3(X, Z);
    return Math.exp(-p.D * q * q * t) * ((1 - p.alpha) * stillTurn(p, t, q) + p.alpha * S * swimTurn(q, t, p));
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
    return Math.exp(-p.D * q * q * t) * ((1 - p.alpha) * still * stillTurn(p, t, q) + p.alpha * sw * swimTurn(q, t, p));
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
    // B between 0 and the d measured at the shortest delays (d can never fall below B)
    const bHi = Math.max(0, y[0] + BTOL * A0) / scale;
    const bFix = NOISE_B !== null ? NOISE_B / scale : null;
    p0[1] = bFix !== null ? bFix : Math.min(bHi, Math.max(0, p0[1]));
    const clamp = function (p) { if (free) p[3] = Math.min(3, Math.max(0.3, p[3])); p[1] = bFix !== null ? bFix : Math.min(bHi, Math.max(0, p[1])); return p; };
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
    for (let i = 0; i < L; i++) { const e = Math.exp(-D * q2 * taus[i]); g1[i] = 1 - e; g2[i] = Dr > 0 ? e * (1 - stillTurn({ b: 1, Dr: Dr }, taus[i], r.q)) : 0; }
    return turnAB(r, g1, g2);
  }
  // d = c1 g1 + c2 g2 + B at one q, c1 = A, c2 = A b: least squares in (c1, c2, B) with c2 kept in [0, c1] (b between 0
  // and 1), A within the bounds of boundAB and B between 0 and the d at the shortest delays (dMin)
  function turnAB(r, g1, g2) {
    const L = g1.length;
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
    let x = g2.some(function (v) { return v !== 0; }) ? solve3() : solve2(0);     // round cells (D_R = 0): no turning
    if (!x || !(x.c1 > 0) || x.c2 < 0 || x.c2 > x.c1) { const a = solve2(0), b = solve2(1); const cost = function (z) { if (!z) return Infinity; let c = 0; for (let i = 0; i < L; i++) { const e = z.c1 * g1[i] + z.c2 * g2[i] + z.B - r.y[i]; c += e * e; } return c; }; x = cost(a) <= cost(b) ? a : b; }
    const hiA = r.Ahi > 0 ? Math.min(3 * r.scale, r.Ahi) : 3 * r.scale, loA = r.Alo > 0 ? Math.min(r.Alo, hiA) : 0;
    // A within its bounds and B between 0 and the d at the shortest delays (see boundAB), with the share b kept
    if (x && (x.c1 < loA || x.c1 > hiA || x.B < 0 || x.B > dMin(r) || NOISE_B !== null)) {
      const bq = x.c1 > 0 ? Math.min(1, Math.max(0, x.c2 / x.c1)) : 0, g = new Float64Array(L); for (let i = 0; i < L; i++) g[i] = g1[i] + bq * g2[i];
      const ab = NOISE_B !== null ? boxAB(r.y, g, loA, hiA, NOISE_B, NOISE_B) : boxAB(r.y, g, loA, hiA, 0, dMin(r)); x = { c1: ab.A, c2: bq * ab.A, B: ab.B };
    }
    return x;
  }
  // start.noTurn: round cells, which cannot fade by turning (a free fading would mimic other things, such as cells
  // leaving a thin confocal slice): D only
  function fitStill(taus, rows, start) {
    const L = taus.length, g1 = new Float64Array(L), g2 = new Float64Array(L), nt = start.noTurn === true;
    const resid = function (p) {
      const D = Math.exp(p[0]), Dr = nt ? 0 : Math.exp(p[1]), out = new Float64Array(rows.length * L);
      rows.forEach(function (r, j) { const x = stillRow(r, taus, D, Dr, g1, g2); for (let i = 0; i < L; i++) out[j * L + i] = x ? (x.c1 * g1[i] + x.c2 * g2[i] + x.B - r.y[i]) / r.scale : 1; });
      return out;
    };
    const clamp = function (p) {
      p[0] = Math.min(Math.log(D_LIMITS ? D_LIMITS[1] : 1e3), Math.max(Math.log(D_LIMITS ? D_LIMITS[0] : 1e-5), p[0]));
      if (!nt) p[1] = Math.min(Math.log(100), Math.max(Math.log(1e-3), p[1])); return p;
    };
    let best = null;
    for (const dr0 of nt ? [0] : [start.Dr || 0.3, 3 * (start.Dr || 0.3)]) {
      const r = DDM.lm(resid, nt ? [Math.log(Math.max(1e-4, start.D))] : [Math.log(Math.max(1e-4, start.D)), Math.log(dr0)], clamp);
      if (best === null || r.cost < best.cost) best = r;
    }
    const D = Math.exp(best.p[0]), Dr = nt ? 0 : Math.exp(best.p[1]);
    const se = function (i) { return best.cov && best.cov[i][i] > 0 ? Math.sqrt(best.cov[i][i]) : null; };
    const ab = rows.map(function (r) { const x = stillRow(r, taus, D, Dr, g1, g2); return x ? { A: x.c1, B: x.B, b: x.c1 > 0 ? x.c2 / x.c1 : 0 } : { A: r.A, B: r.B, b: 0 }; });
    const bm = ab.reduce(function (s, x) { return s + x.b; }, 0) / Math.max(1, ab.length);
    return { kind: "still", v_um_s: start.v, alpha: 0, spread: start.spread, D_um2_s: D, turn_share: bm, D_r_s: Dr, cost: best.cost, n_points: rows.length * L,
             D_rel_err: se(0), D_r_rel_err: nt ? null : se(1), ab: ab, stroke_um: 0, stroke_hz: 0 };
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
    // Ds: turning of the swimmers' heading (rotational diffusion), free only with the optics of elongated cells
    // (a fit of one or two q values keeps the value it starts from)
    if (fixed.Ds === undefined && (!SWIM_DS_FREE || rows.length < 4 || (fixed.b === 0 && !OPTICS))) fixed = Object.assign({ Ds: SWIM_DS_FREE && start.Ds > 0 ? start.Ds : DRS }, fixed);
    const names = ["v", "alpha", "spread", "D", "b", "Dr", "A", "f", "Ds"], free = names.filter(function (k) { return fixed[k] === undefined; });
    const toP = { v: Math.log(start.v), alpha: start.alpha, spread: start.spread, D: Math.log(Math.max(start.D, 1e-4)), b: start.b === undefined ? 0.5 : start.b, Dr: Math.log(start.Dr === undefined ? 0.2 : Math.max(1e-3, start.Dr)),
                  A: Math.log(Math.max(0.01, start.A || 1)), f: Math.log(Math.max(0.1, start.f || 10)), Ds: Math.log(Math.min(DS_MAX, start.Ds > 0 ? start.Ds : 0.1)) };
    const LOGS = { v: 1, D: 1, Dr: 1, A: 1, f: 1, Ds: 1 };
    const unpack = function (p) {
      const o = {}; names.forEach(function (k) { o[k] = fixed[k] !== undefined ? fixed[k] : null; });
      free.forEach(function (k, i) { o[k] = LOGS[k] ? Math.exp(p[i]) : p[i]; });
      return o;
    };
    const fbuf = new Float64Array(L), g1 = new Float64Array(L), g2 = new Float64Array(L);
    // turning share b at each q (fixed.b === "q"): the cells that do not swim fade as they turn, share b of the pattern
    // that depends on the orientation, which differs from q to q (in phase contrast the halo cancels most of the rest
    // at small q). f is linear in b, f = f0 - b (f0 - f1), so A, A b and B come from linear least squares at each q
    const perq = fixed.b === "q";
    const rowAB = function (r, par) {
      if (!perq) { for (let i = 0; i < L; i++) fbuf[i] = fm(r, taus[i], par); const ab = boundAB(r, fbuf); for (let i = 0; i < L; i++) g1[i] = ab.A * (1 - fbuf[i]) + ab.B; return ab; }
      const p0 = Object.assign({}, par, { b: 0 }), p1 = Object.assign({}, par, { b: 1 });
      for (let i = 0; i < L; i++) { const f0 = fm(r, taus[i], p0), f1 = fm(r, taus[i], p1); g1[i] = 1 - f0; g2[i] = f0 - f1; }
      const x = turnAB(r, g1, g2) || { c1: r.A, c2: 0, B: r.B };
      for (let i = 0; i < L; i++) g1[i] = x.c1 * g1[i] + x.c2 * g2[i] + x.B;
      return { A: x.c1, B: x.B, b: x.c1 > 0 ? Math.min(1, Math.max(0, x.c2 / x.c1)) : 0 };
    };
    const resid = function (p) {
      const par = unpack(p), out = new Float64Array(rows.length * L);
      rows.forEach(function (r, j) {
        rowAB(r, par);       // the model is left in g1
        for (let i = 0; i < L; i++) out[j * L + i] = (g1[i] - r.y[i]) / r.scale;
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
        if (k === "Ds") p[i] = Math.min(Math.log(DS_MAX), Math.max(Math.log(1e-3), p[i]));
        if (k === "A") p[i] = Math.min(Math.log(50), Math.max(Math.log(0.01), p[i]));
        if (k === "f") p[i] = Math.min(Math.log(0.5 / (taus[0] || 1e-3)), Math.max(Math.log(0.1), p[i]));   // below the Nyquist frequency of the movie
      });
      return p;
    };
    const r = DDM.lm(resid, free.map(function (k) { return toP[k]; }), clamp);
    const par = unpack(r.p);
    const se = function (k) { const i = free.indexOf(k); return i >= 0 && r.cov && r.cov[i][i] > 0 ? Math.sqrt(r.cov[i][i]) : null; };
    const ab = rows.map(function (rw) { return rowAB(rw, par); });
    const bmean = perq ? ab.reduce(function (a, x) { return a + x.b; }, 0) / Math.max(1, ab.length) : par.b;
    return { kind: kind, v_um_s: par.v, alpha: par.alpha, spread: par.spread, D_um2_s: par.D, turn_share: bmean, turn_perq: perq, D_r_s: par.Dr, swim_dr_s: par.Ds, stroke_um: par.A, stroke_hz: par.f, cost: r.cost, n_points: rows.length * L,
             v_rel_err: se("v"), alpha_err: se("alpha"), spread_err: se("spread"), D_rel_err: se("D"), stroke_rel_err: se("A"), stroke_hz_rel_err: se("f"), ab: ab };
  }

  // A and B of one q for a given f: least squares, with A kept between 0 and 3 times A + B = 2 var (the plateau the
  // data must reach); without the bound a model that hardly decays (f near 1) can mimic any rise with a huge A
  // B is kept between 0 and the d measured at the shortest delays (dMin): d = A (1 - f) + B with A (1 - f) >= 0 can never
  // fall below B, so a larger B would only absorb a misfit (and give normalized points below 0)
  function boundAB(r, f) {
    const L = f.length, hiA = r.Ahi > 0 ? Math.min(3 * r.scale, r.Ahi) : 3 * r.scale, loA = r.Alo > 0 ? Math.min(r.Alo, hiA) : 0;
    const g = gbuf.length === L ? gbuf : (gbuf = new Float64Array(L)); for (let i = 0; i < L; i++) g[i] = 1 - f[i];
    return NOISE_B !== null ? boxAB(r.y, g, loA, hiA, NOISE_B, NOISE_B) : boxAB(r.y, g, loA, hiA, 0, dMin(r));
  }
  let gbuf = new Float64Array(0);
  // ceiling for B: d at the shortest delay (d rises with the delay, so it is at least B), plus 2 % of the whole
  // amplitude for the scatter of the data (a few modes at small q: the points scatter by some %)
  // camera noise B, the same at every q (white noise): 2 x the variance per pixel, from the mean count in electrons,
  // the excess-noise factor and the read noise of the detector (known to the experimenter). null: B fitted at each q
  let NOISE_B = null;
  function dMin(r) { if (r.dmin === undefined) r.dmin = Math.max(0, r.y[0] + BTOL * (r.Atot > 0 ? r.Atot : r.scale)); return r.dmin; }
  const BTOL = 0.02;
  // least squares of y = A g + B with A in [loA, hiA] and B in [loB, hiB]: the free solution when it is inside, else the
  // best point on the edges
  function boxAB(y, g, loA, hiA, loB, hiB) {
    const L = y.length; let sg = 0, sgg = 0, sy = 0, sgy = 0;
    for (let i = 0; i < L; i++) { sg += g[i]; sgg += g[i] * g[i]; sy += y[i]; sgy += g[i] * y[i]; }
    const cl = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
    const cost = function (A, B) { let c = 0; for (let i = 0; i < L; i++) { const e = A * g[i] + B - y[i]; c += e * e; } return c; };
    const det = L * sgg - sg * sg;
    if (Math.abs(det) > 1e-300) { const A = (L * sgy - sg * sy) / det, B = (sy - A * sg) / L; if (A >= loA && A <= hiA && B >= loB && B <= hiB) return { A: A, B: B }; }
    const cand = [];
    for (const A of [loA, hiA]) cand.push({ A: A, B: cl((sy - A * sg) / L, loB, hiB) });
    for (const B of [loB, hiB]) cand.push({ A: sgg > 0 ? cl((sgy - B * sg) / sgg, loA, hiA) : loA, B: B });
    let best = cand[0], bc = Infinity; for (const c of cand) { const v = cost(c.A, c.B); if (v < bc) { bc = v; best = c; } }
    return best;
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
    DRS = opts.swim_dr > 0 ? opts.swim_dr : 0; SWIM_DS_FREE = false; DS_MAX = 3; turnCache.clear();
    NOISE_B = null;     // camera noise from the mean count (see NOISE_B)
    if (opts.noise !== "fit" && movie.info && movie.info.detector_kind === "camera" && movie.frames && typeof movie.info.read_noise_e === "number") {
      let s = 0; const F = movie.frames; for (let k = 0; k < F.length; k++) s += F[k];
      NOISE_B = 2 * ((movie.info.excess_noise || 1) * s / F.length + movie.info.read_noise_e * movie.info.read_noise_e);
    }
    yield { stage: "Fitting each q", frac: 0.9 };
    // per-q compressed fits (beta free, and with the fixed beta if asked)
    const betaFix = opts.beta === null || opts.beta === undefined ? null : opts.beta;
    // uneven frame times reach delays far beyond those of evenly spaced frames, where the slow step of the cells that do
    // not swim joins the fast one: one compressed exponential then follows neither. Its fits keep to the delays the same
    // frames evenly spaced would give (up to T/2 frame intervals; all delays when fewer than 8 are left)
    let Lc = L;
    if (S.pairs) { let k = 0; while (k < L && taus[k] <= (S.T / 2) * S.dt_s * (1 + 1e-9)) k++; if (k >= 8) Lc = k; }
    const tc = Lc < L ? taus.slice(0, Lc) : taus;
    const rows = [];
    for (let b = 1; b <= nb; b++) {
      if (!(S.nmodes[b] > 0)) continue;
      const y = new Float64Array(L); for (let i = 0; i < L; i++) y[i] = S.dq[i][b];
      let B0 = NOISE_B !== null ? NOISE_B : S.B_est[b], A0 = NOISE_B !== null ? 2 * S.varq[b] - NOISE_B : S.A_est[b]; if (!(A0 > 0)) A0 = Math.max(y[L - 1] - B0, 1e-12);
      const yc = Lc < L ? y.slice(0, Lc) : y;
      const cf = fitCompressed(tc, yc, A0, B0, null), cx = betaFix === null ? cf : fitCompressed(tc, yc, cf.A, cf.B, betaFix);
      // whole amplitude from the mean power (cells that stay put included), with the scatter of a few modes allowed for
      // (and at least that amplitude divided by the same margin: cells that stay put still count in the whole)
      const Atot = S.powq ? 2 * S.powq[b] - (NOISE_B !== null ? NOISE_B : S.B_est[b]) : NaN, kA = Math.max(1.3, 1 + 3 / Math.sqrt(Math.max(1, S.nmodes[b])));
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
        const Bq = NOISE_B !== null ? NOISE_B : S.B_est[r.bin], Aq = 2 * S.varq[r.bin] - Bq;
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
      // the fastest rate per q in the data, as a speed (for the check on "swimmers" far faster than anything measured)
      const vRateMax = usedC.reduce(function (m, r) { return Math.max(m, r.gamma_hz / r.q); }, 0);
      comp = { v0_um_s: v0, v_rate_max_um_s: vRateMax, v0_rel_err: v0_rel_err, slope: slope, v_line_um_s: vlin, intercept_hz: c, beta_free_mean: bmean, beta: betaFix, n_points: n };
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
    ROT = kind === "2d" ? 4 : 6;
    // size of the cells for the swimmer model (elongated cells only): given, or those of the movie (known to the
    // experimenter from the images, like D from the size and the viscosity)
    SHAPE = null; shapeCache.clear(); OPTICS = null; opticsCache.clear();
    // image of one cell from the optics of the microscope (default; opts.cell_shape: "cylinder" for the idealized rod)
    if (opts.cell_shape === "optics" && movie.info && movie.info.particle && movie.info.particle.oriented && movie.info.kernel && movie.info.kernel_q && movieApi()) {
      const orient = [];
      if (kind === "2d") { for (let k = 0; k < 48; k++) { const ph = 2 * Math.PI * (k + 0.5) / 48; orient.push({ x: Math.cos(ph), y: Math.sin(ph), z: 0, w: 1 / 48 }); } }
      // (3D: polar axis along q, which is along x; mu = u.x on Gauss-Legendre nodes over [0, 1], as a rod looks the same
      // from both ends, and 16 azimuths around q)
      else { const G = gaussLegendre(24); for (let a = 0; a < 24; a++) { const mu = G.x[a], sm = Math.sqrt(1 - mu * mu); for (let k = 0; k < 16; k++) { const ph = 2 * Math.PI * (k + 0.5) / 16; orient.push({ x: mu, y: sm * Math.cos(ph), z: sm * Math.sin(ph), w: G.w[a] / 16 }); } } }
      // depths of the centres: spread over the cell (3D), or the height of the cells along the glass (2D)
      const zr = movie.info.cell_z_um, zs = [];
      const ts = movie.truth && movie.truth.swim;
      if (kind === "2d" && ts && ts.n_plane > 0 && ts.height_um !== undefined) zs.push(zr[1] - ts.height_um);     // z = focus - height
      else for (let k = 0; k < 24; k++) zs.push(zr[0] + (zr[1] - zr[0]) * (k + 0.5) / 24);
      // weights over the directions of swimming from the optics only when asked (opts.cell_shape "optics"); by default
      // from the idealized rod below, and the optics give the turning
      OPTICS = { info: movie.info, kind: kind, orient: orient, zs: zs, weights: opts.optics_weights !== false };
      if (OPTICS.weights) SHAPE = { L: 0, R: 0, optics: true };
      // the turning of the swimmers is unknown to the experimenter: fitted, unless given (opts.swim_dr)
      SWIM_DS_FREE = !(opts.swim_dr > 0) && opts.swim_turning !== false;
    }
    if (opts.cell_shape !== false && !(OPTICS && OPTICS.weights)) {
      const pc = movie.info && movie.info.particle, geo = pc && pc.oriented && pc.geometry;
      if (opts.cell_length_um > 0) SHAPE = { L: opts.cell_length_um, R: (opts.cell_width_um > 0 ? opts.cell_width_um : 0) / 2 };
      else if (opts.D_from_cells === true && geo && geo.kind === "cylinder" && geo.a_par > geo.a_perp) SHAPE = { L: 2 * geo.a_par, R: geo.a_perp };
      // the turning of the swimmers is unknown to the experimenter: fitted, unless given (opts.swim_dr)
      if (movie.info && movie.info.particle && movie.info.particle.oriented) SWIM_DS_FREE = !(opts.swim_dr > 0) && opts.swim_turning !== false;
      // at most the rotational diffusion of the body alone (from its size and the viscosity, when known, as D): the
      // flagella add drag. Without this limit the fading can stand in for the errors of the shape weight of long rods
      // (B. subtilis: D_s 0.8 rad^2/s and the speed 23 % low)
      const DrB = opts.Dr_hint > 0 ? opts.Dr_hint : opts.D_from_cells === true && movie.truth && movie.truth.D_r_s > 0 ? movie.truth.D_r_s : 0;
      DS_MAX = DrB > 0 ? DrB : 3;
      if (DS_MAX < 2e-3) SWIM_DS_FREE = false;
    }
    // model fits on the used q: the swimmer model (with its safeguards), the depth and stroke models. quick: repeat of
    // the main fits on other data (one block of the movie left out), started from the main result (prev), keeping its
    // choices (no swimming or not, depth, stroke) and leaving out the per-q fits
    const fitModels = function* (used, quick, prev) {
      let alphaDirect = null, base = null;
      const elongated = !!(movie.info && movie.info.particle && movie.info.particle.oriented);   // rods: known from the images
      if (Dh > 0 && used.length >= 3 && opts.share_from_amplitude !== false && S.pairs) {
        // uneven frame times: per q, the delays after the swimmers have renewed the pattern and before the others have
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
          for (const i of use) { p += (r.y[i] - (NOISE_B !== null ? NOISE_B : S.B_est[r.bin])) / r.Atot; e += Math.exp(-Dh * q2 * taus[i]); }
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
      if (!quick) yield { stage: "Fitting the swimmer model", frac: 0.94 };
      let swim = null;
      // quick repeat of a result without swimming: only the fit of cells that do not swim matters
      if (quick && prev.noSwim) {
        const still = fitStill(taus, used, { v: prev.head.v_um_s, spread: prev.head.spread, D: prev.head.D_um2_s, Dr: prev.head.D_r_s || 0.3, noTurn: !elongated });
        still.no_swim = true; still.perq = [];
        return { alphaDirect: alphaDirect, swim: still, swimDepth: null, swimStrokeFit: null, base: null };
      }
      if (used.length >= 3 && comp) {
        // several starts (speeds around the compressed estimate, small and large swimming share); the best fit is kept
        let best = null;
        // v0 of the compressed fit is about the mean speed / 2.2 in 3D and / 1.7 in the plane (narrow speed distributions)
        if (quick) best = fitSwimGlobal(kind, taus, used, { v: prev.base.v_um_s, alpha: prev.base.alpha, spread: prev.base.spread, D: prev.base.D_um2_s, b: 0.5, Dr: 0.2, Ds: prev.base.swim_dr_s }, turnFix);
        else for (const fv of [1.2, kind === "2d" ? 1.8 : 2.3, 3.5]) for (const a0 of [0.3, 0.8]) {
          const g = fitSwimGlobal(kind, taus, used, { v: comp.v0_um_s * fv, alpha: a0, spread: 0.3, D: 0.3, b: 0.5, Dr: 0.2 }, turnFix);
          if (best === null || g.cost < best.cost) best = g;
        }
        swim = best; base = best;
        // diffusion expected from the size of the cells and the viscosity (opts.D_hint, known to the experimenter): when
        // the data do not ask for another value, it is kept. Without it the share of swimmers can drift with a D near 0
        // (cells that do not swim then look frozen, and frozen cells add nothing to the changes in the movie)
        // (the page passes D_from_cells: the bulk value the simulation uses, which the experimenter computes the same way
        // from the size and shape of the cells and the viscosity)
        if (Dh > 0) {
          // first without turning; if that does not describe the data, with the turning of rods (b, D_R) free
          const st = { v: best.v_um_s, alpha: Math.max(0.05, best.alpha), spread: best.spread, D: Dh, b: 0.3, Dr: 0.3, Ds: best.swim_dr_s };
          let g = fitSwimGlobal(kind, taus, used, st, Object.assign({ D: Dh }, turnFix));
          if (!(g.cost <= 1.03 * best.cost) && !turns) g = fitSwimGlobal(kind, taus, used, st, Object.assign({ D: Dh }, shareFix));
          if (g.cost <= 1.03 * best.cost) { g.D_fixed = true; g.cost_free_D = best.cost; swim = g; }
        }
        // turning of the cells that do not swim, with its share b at each q (opts.turn_perq, on by default): kept when it
        // describes the data clearly better (5 % lower cost). Phase contrast needs it at the largest spacings, where the
        // halo leaves mostly the part of a rod's image that depends on its orientation
        if (opts.turn_perq !== false && !turns && elongated) {
          const st = { v: swim.v_um_s, alpha: Math.max(0.05, swim.alpha), spread: swim.spread, D: swim.D_um2_s, Dr: 0.3, Ds: swim.swim_dr_s };
          // D_R from the size of the rods and the viscosity, as D (opts.Dr_hint, or the bulk value when D_from_cells)
          const DrH = opts.Dr_hint > 0 ? opts.Dr_hint : opts.D_from_cells === true && movie.truth && movie.truth.D_r_s > 0 ? movie.truth.D_r_s : 0;
          const fxT = Object.assign(swim.D_fixed ? { D: swim.D_um2_s } : {}, DrH > 0 ? { Dr: DrH } : {}, { b: "q" }, opts.turn_alpha === "free" ? shareFix : { alpha: swim.alpha });
          let g = fitSwimGlobal(kind, taus, used, st, fxT);
          // (with the swimmers' turning free, also from no turning: the cost has a second valley there)
          if (SWIM_DS_FREE) { const g0 = fitSwimGlobal(kind, taus, used, st, Object.assign({ Ds: DRS }, fxT)); if (g0.cost < g.cost) g = g0; }
          if (g.cost < 0.95 * swim.cost) { if (swim.D_fixed) { g.D_fixed = true; g.cost_free_D = swim.cost_free_D; } g.cost_no_turn = swim.cost; swim = g; }
        }
        // cells that do not swim at all (rods also fade as they turn, share b at rate 6 D_R): if this describes the data
        // about as well, no swimming is found (the swimmer model alone mistakes the turning of still rods for slow swimmers)
        const still = quick && !prev.noSwim ? null : fitStill(taus, used, quick ? { v: swim.v_um_s, spread: swim.spread, D: prev.head.D_um2_s, Dr: prev.head.D_r_s || 0.3, noTurn: !elongated } : { v: swim.v_um_s, spread: swim.spread, D: Dh > 0 ? Dh : 0.3, Dr: 0.3, noTurn: !elongated });
        if (still) swim.cost_still = still.cost;
        if (quick && prev.noSwim) { still.no_swim = true; still.perq = []; swim = still; }
        else if (!quick)
        // also when the swimmer fit itself finds next to no swimmers, or a small share of "swimmers" whose rates hardly grow
        // with q (log-log slope under 0.5: rods that turn, not cells that swim)
        // (or "swimmers" far faster than any rate in the data: v above 15 times the largest rate / q of the compressed fits;
      // v0, their mean, is no measure of that when the curves rise in two steps)
        if (still.cost <= 1.1 * swim.cost || swim.alpha < 0.05 || (comp.slope < 0.5 && swim.alpha < 0.3) || swim.v_um_s > 15 * comp.v_rate_max_um_s || swim.v_um_s < 0.3 * comp.v0_um_s) { still.no_swim = true; still.cost_swim = swim.cost; still.perq = []; swim = still; }
        // per-q speed and fraction with spread and D fixed: the speed should not depend on q
        if (!swim.no_swim && !quick) swim.perq = used.map(function (r, j) {
          const g = fitSwimGlobal(kind, taus, [r], { v: swim.v_um_s, alpha: swim.alpha, spread: swim.spread, D: swim.D_um2_s, Ds: swim.swim_dr_s }, { spread: swim.spread, D: swim.D_um2_s, b: bOf(swim, j), Dr: swim.D_r_s });
          return { q: r.q, v_um_s: g.v_um_s, alpha: g.alpha };
        });
      }
      // 3D swimmers seen through the depth response of the microscope (when asked and the movie carries its optics)
      let swimDepth = null;
      if (swim && !swim.no_swim && kind === "3d" && opts.depth === true && movie.info && movie.info.kernel && (!quick || prev.depth)) {
        if (!quick) yield { stage: "Depth response of the microscope", frac: 0.95 };
        used.forEach(function (r) { if (!r.depth) r.depth = OPTICS && OPTICS.weights && OPTICS.kind === "3d" ? opticsTable(r.q) : depthTable(movie.info, r.q); });
        let best = null;
        const fixD = quick && prev.depth.D_fixed ? { D: prev.depth.D_um2_s } : {};
        for (const st of quick ? [{ v: prev.depth.v_um_s, alpha: prev.depth.alpha }] : [{ v: swim.v_um_s, alpha: swim.alpha }, { v: 0.8 * swim.v_um_s, alpha: Math.min(1, swim.alpha + 0.1) }]) {
          const g = fitSwimGlobal("depth", taus, used, { v: st.v, alpha: st.alpha, spread: swim.spread, D: swim.D_um2_s, b: swim.turn_share, Dr: swim.D_r_s, Ds: swim.swim_dr_s }, Object.assign({}, swim.turn_perq ? Object.assign({ b: "q", Dr: swim.D_r_s }, shareFix) : turnFix, fixD));
          if (best === null || g.cost < best.cost) best = g;
        }
        if (fixD.D !== undefined) best.D_fixed = true;
        // D expected from the cells, as for the swimmer model: kept when the data do not ask for another value (a free D
        // trades against the share of swimmers: in a thin confocal slice it ran to its lower limit, with too many swimmers)
        if (!quick && Dh > 0) {
          const g = fitSwimGlobal("depth", taus, used, { v: best.v_um_s, alpha: best.alpha, spread: best.spread, D: Dh, b: swim.turn_share, Dr: swim.D_r_s, Ds: best.swim_dr_s }, Object.assign({}, swim.turn_perq ? Object.assign({ b: "q", Dr: swim.D_r_s }, shareFix) : turnFix, { D: Dh }));
          if (g.cost <= 1.03 * best.cost) { g.D_fixed = true; g.cost_free_D = best.cost; best = g; }
        }
        swimDepth = best;
        if (!quick) swimDepth.perq = used.map(function (r, j) {
          const g = fitSwimGlobal("depth", taus, [r], { v: best.v_um_s, alpha: best.alpha, spread: best.spread, D: best.D_um2_s, Ds: best.swim_dr_s }, { spread: best.spread, D: best.D_um2_s, b: bOf(best, j), Dr: best.D_r_s });
          return { q: r.q, v_um_s: g.v_um_s, alpha: g.alpha };
        });
      }
      // 3D swimmers with a stroke (opts.stroke): the cost on a grid of stroke frequencies and amplitudes with the rest from
      // the straight model, then a full fit from the best point (the cost has many local minima in f)
      let swimStrokeFit = null;
      if (swim && !swim.no_swim && kind === "3d" && opts.stroke === true && !swimDepth && (!quick || prev.stroke)) {
        if (!quick) yield { stage: "Fitting the stroke", frac: 0.955 };
        // D: the value expected from the cells when given (the straight model may have bent it to mimic the stroke)
        const Dst = Dh > 0 ? Dh : swim.D_um2_s;
        // (the fading of the cells that do not swim as in the straight model: for round cells it stands for their contrast
        // changing as they diffuse up and down through the focus, which no model here describes; without it the stroke
        // model fitted sperm with many dead cells badly and the straight one read the speed 27 % high)
        const base = { v: swim.v_um_s, alpha: swim.alpha, spread: swim.spread, D: Dst, b: swim.turn_share, Dr: swim.D_r_s, Ds: swim.swim_dr_s };
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
        // (the repeats for the uncertainties start where the main fit started, the best point of its grid: started from the
        // main result they stay in its valley, and the error came out several times too small)
        if (quick) bestP = Object.assign({}, prev.stroke.grid_start || Object.assign({}, base, { v: prev.stroke.v_um_s, alpha: prev.stroke.alpha, spread: prev.stroke.spread, A: prev.stroke.stroke_um, f: prev.stroke.stroke_hz }));
        else for (const fz of [2, 3, 5, 8, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 130, 160, 200]) {
          if (fz >= 0.9 * fNyq) continue;
          for (const Az of [0.3, 0.7, 1.5, 3, 6, 12]) for (const a0 of [base.alpha, 0.95]) for (const vf of [1, 1.15]) {
            const par = Object.assign({}, base, { A: Az, f: fz, alpha: a0, v: base.v * vf }), c = sub.length ? costSub(par) : costAt(par);
            if (c < bestC) { bestC = c; bestP = par; }
          }
        }
        if (bestP) {
          // fitted on every other q (the stroke model is slow), with D from the straight model; compared on all q
          // (turning of the cells that do not swim as in the straight model, which the grid used)
          const fixS = Object.assign({ D: Dst }, turnFix, { b: base.b, Dr: base.Dr }), half = used.filter(function (r, j) { return j % 2 === 0; });
          const g = fitSwimGlobal(sk, taus, half.length >= 3 ? half : used, bestP, fixS); g.cost_half = g.cost; g.grid_start = Object.assign({}, bestP);
          g.cost = costAt({ v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz, Ds: g.swim_dr_s });
          g.ab = used.map(function (r) { for (let i = 0; i < L; i++) fb[i] = swimF(sk, r.q, taus[i], { v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz, Ds: g.swim_dr_s }); return boundAB(r, fb); });
          // (kept for the record when the straight model is the better fit)
          if (!quick) swim.stroke_tried = { cost: g.cost, v_um_s: g.v_um_s, alpha: g.alpha, stroke_um: g.stroke_um, stroke_hz: g.stroke_hz };
          if (quick || g.cost < swim.cost) {
            if (swim.D_fixed) g.D_fixed = true;
            if (!quick) g.perq = used.map(function (r) {
              const h = fitSwimGlobal(sk, taus, [r], { v: g.v_um_s, alpha: g.alpha, spread: g.spread, D: g.D_um2_s, A: g.stroke_um, f: g.stroke_hz, Ds: g.swim_dr_s }, { spread: g.spread, D: g.D_um2_s, b: g.turn_share, Dr: g.D_r_s, A: g.stroke_um, f: g.stroke_hz });
              return { q: r.q, v_um_s: h.v_um_s, alpha: h.alpha };
            });
            swimStrokeFit = g;
          }
        }
      }
      return { alphaDirect: alphaDirect, swim: swim, swimDepth: swimDepth, swimStrokeFit: swimStrokeFit, base: base };
    };
    const sk = opts.stroke_dir === "across" ? "strokex" : "stroke";   // stroke along the axis or across it
    const FM = yield* fitModels(used, false, null);
    const alphaDirect = FM.alphaDirect, swim = FM.swim, swimDepth = FM.swimDepth, swimStrokeFit = FM.swimStrokeFit;
    // uncertainties: the points of d(q, dt) are not independent (all delays come from the same frames), so the
    // covariance of a fit understates the scatter from movie to movie. Jackknife instead: the same fits repeated with one
    // of K blocks of the movie left out; error = sqrt((K-1)/K sum (x_j - mean)^2)
    const head0 = swimDepth || swimStrokeFit || swim;
    let jk = null;
    if (head0 && opts.jackknife !== false && S.jackDq && used.length >= 3) {
      yield { stage: "Uncertainties: the fits repeated with parts of the movie left out", frac: 0.96 };
      const prev = { base: FM.base || head0, head: head0, noSwim: head0.no_swim === true, depth: swimDepth, stroke: swimStrokeFit };
      const samples = [];
      for (let j = 0; j < S.blocks; j++) {
        const dj = S.jackDq(j);
        const uj = used.map(function (r) { const y = new Float64Array(L); for (let i = 0; i < L; i++) y[i] = dj[i][r.bin]; const o = Object.assign({}, r, { y: y }); delete o.dmin; return o; });
        const R = yield* fitModels(uj, true, prev);
        const h = R.swimDepth || R.swimStrokeFit || R.swim;
        if (h) samples.push({ v: h.no_swim ? null : h.v_um_s, alpha: h.alpha, spread: h.spread, D: h.D_um2_s, A: h.stroke_um, f: h.stroke_hz });
      }
      const err = function (k) {
        const v = samples.map(function (x) { return x[k]; }).filter(function (x) { return x !== null && x !== undefined && isFinite(x); });
        if (v.length < 3) return null;
        const n = v.length, m = v.reduce(function (a, b) { return a + b; }, 0) / n; let s2 = 0; v.forEach(function (x) { s2 += (x - m) * (x - m); });
        return Math.sqrt((n - 1) / n * s2);
      };
      jk = { blocks: S.blocks, n: samples.length, v: err("v"), alpha: err("alpha"), spread: err("spread"), D: head0.D_fixed ? null : err("D"), stroke_um: err("A"), stroke_hz: err("f"), samples: samples };
    }
    // amplitude and noise used to normalise f(q, dt): from the swimmer fit (it has the slow part of the particles that
    // do not swim), else from the compressed fits
    const head = swimDepth || swimStrokeFit || swim;
    used.forEach(function (r, j) { const ab = head && head.ab[j] && head.ab[j].A > 0 ? head.ab[j] : null; r.An = ab ? ab.A : r.A; r.Bn = ab ? ab.B : r.B; });
    // rate of the fast step at each q: when only part of the cells swim, each curve rises in two steps, and one
    // compressed exponential per q follows the swimmers at small q and the slow step of the others at large q (its rate
    // levels off). Here the slow part (share, D, turning) and A, B come from the swimmer fit, and only the swimmers'
    // step exp(-(G t)^beta) is fitted at each q: G = v0 q for swimming.
    let fast = null;
    if (head && !head.no_swim && head.alpha > 0.05) {
      const pts = [];
      used.forEach(function (r, j) {
        const bq = bOf(head, j), a = head.alpha, e = new Float64Array(L), st = new Float64Array(L);
        for (let i = 0; i < L; i++) { e[i] = Math.exp(-head.D_um2_s * r.q * r.q * taus[i]); st[i] = (1 - a) * stillTurn({ b: bq, Dr: head.D_r_s }, taus[i], r.q); }
        const model = function (p, i) { return r.An * (1 - e[i] * (st[i] + a * Math.exp(-Math.pow(Math.exp(p[0]) * taus[i], p[1])))) + r.Bn; };
        const resid = function (p) { const o = new Float64Array(L); for (let i = 0; i < L; i++) o[i] = (model(p, i) - r.y[i]) / r.scale; return o; };
        const clamp = function (p) { p[1] = Math.min(3, Math.max(0.5, p[1])); p[0] = Math.min(Math.log(1e3 / taus[0]), Math.max(Math.log(0.01 / taus[L - 1]), p[0])); return p; };
        const g0 = r.q * head.v_um_s / (kind === "2d" ? 1.7 : 2.2);
        const fit = DDM.lm(resid, [Math.log(g0), 1.5], clamp);
        const G = Math.exp(fit.p[0]), se = fit.cov && fit.cov[0][0] > 0 ? Math.sqrt(fit.cov[0][0]) : Infinity;
        // the step must happen inside the movie (between the first delay and the last) to be read
        r.gamma_fast = G * taus[0] < 3 && G * taus[L - 1] > 1 ? G : null; r.beta_fast = fit.p[1]; r.gamma_fast_se = se;
        // the same rate as the fitted model predicts it (1/e time of the swimmers' part; for long cells it grows more
        // slowly than q, see "The shape of the cells")
        const par = { v: head.v_um_s, alpha: 1, spread: head.spread, D: 0, b: 0, Dr: 0, A: head.stroke_um, f: head.stroke_hz };
        const sf = function (t) { return swimF(head === swimStrokeFit ? sk : kind, r.q, t, par); };
        let lo = 1e-6, hi = 1e3; for (let k = 0; k < 80; k++) { const mid = Math.sqrt(lo * hi); if (sf(mid) > Math.exp(-1)) lo = mid; else hi = mid; }
        r.gamma_model = 1 / Math.sqrt(lo * hi);
        // and at the true speeds of the simulated swimmers (the same model, for the chart)
        const ts = movie.truth && movie.truth.swim;
        if (ts && ts.n_swimmers > 0) {
          const pt = Object.assign({}, par, { v: ts.v_mean_um_s, spread: Math.min(0.95, Math.max(0.05, ts.v_sd_um_s / ts.v_mean_um_s)) });
          let a1 = 1e-6, b1 = 1e3; for (let k = 0; k < 80; k++) { const mid = Math.sqrt(a1 * b1); if (swimF(head === swimStrokeFit ? sk : kind, r.q, mid, pt) > Math.exp(-1)) a1 = mid; else b1 = mid; }
          r.gamma_true = 1 / Math.sqrt(a1 * b1);
        }
        if (r.gamma_fast !== null && se < 0.3) pts.push({ q: r.q, G: G, beta: fit.p[1] });
      });
      if (pts.length >= 3) {
        let sl = 0, lx = 0, ly = 0, lxx = 0, lxy = 0, bm = 0; const n = pts.length;
        pts.forEach(function (p) { sl += Math.log(p.G / p.q); const X = Math.log(p.q), Y = Math.log(p.G); lx += X; ly += Y; lxx += X * X; lxy += X * Y; bm += p.beta; });
        // how far the measured rates are from the model's, on average (log ratio)
        let dev = 0, nd = 0; used.forEach(function (r) { if (r.gamma_fast && r.gamma_model) { dev += Math.abs(Math.log(r.gamma_fast / r.gamma_model)); nd++; } });
        fast = { v0_um_s: Math.exp(sl / n), slope: (n * lxy - lx * ly) / (n * lxx - lx * lx), beta_mean: bm / n, n_points: n, dev_from_model: nd ? Math.exp(dev / nd) - 1 : null };
      }
    }
    // speed distributions
    yield { stage: "Speed distribution", frac: 0.97 };
    let pv = null;
    if (comp) {
      const vref = head && !head.no_swim && head.v_um_s > 0 ? head.v_um_s : comp.v0_um_s, vmax = 3 * vref, nv = 60, dv = vmax / nv;
      const vgrid = []; for (let k = 0; k <= nv; k++) vgrid.push(k * dv);
      const beta = betaFix !== null ? betaFix : comp.beta_free_mean, v0 = comp.v0_um_s;
      const fromCurve = invertCurve(function (x) { return Math.exp(-Math.pow(v0 * x, beta)); }, kind, vgrid);
      // from the data: columns = kernel of each speed bin (bin 0 = particles that do not swim)
      const D = head ? head.D_um2_s : 0;
      const pts = []; used.forEach(function (r, j) { const bq = head ? bOf(head, j) : 0; for (let i = 0; i < L; i++) { const f = 1 - (r.y[i] - r.Bn) / r.An; if (f > -0.2 && f < 1.2) pts.push({ q: r.q, t: taus[i], f: f, b: bq }); } });
      const m = pts.length, cols = [];
      for (let k = 0; k <= nv; k++) {
        const col = new Float64Array(m + nv);
        for (let i = 0; i < m; i++) {
          const p = pts[i], X = p.q * p.t * vgrid[k], W = k > 0 && SHAPE ? shapeWeights(p.q, kind) : null;
          let sw = 0; if (W) for (let j = 0; j < W.mu.length; j++) sw += W.w[j] * Math.cos(X * W.mu[j]);     // long cells: weighted by their shape
          col[i] = Math.exp(-D * p.q * p.q * p.t) * (k === 0 ? (head ? stillTurn({ b: p.b, Dr: head.D_r_s }, p.t, p.q) : 1) : W ? sw : (kind === "2d" ? besselJ0(X) : Math.sin(X) / X));
        }
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
    // the swimmers' part of the model against x = q dt, for the middle q used (with the shape of the cells it depends a
    // little on q), for the collapse chart
    let collapse = null;
    if (head && !head.no_swim && used.length) {
      const qm = used[Math.floor(used.length / 2)].q, par = { v: head.v_um_s, alpha: 1, spread: head.spread, D: 0, b: 0, Dr: 0, A: head.stroke_um, f: head.stroke_hz };
      const xs = [], fs = []; for (let k = 0; k <= 100; k++) { const x = 1e-3 * Math.pow(1e5, k / 100); xs.push(x); fs.push(swimF(head === swimStrokeFit ? sk : kind, qm, x / qm, par)); }
      collapse = { q_per_um: qm, x: xs, f: fs };
    }
    // master curve: f against q dt for the used q
    const master = used.map(function (r) { const f = new Float64Array(L); for (let i = 0; i < L; i++) f[i] = 1 - (r.y[i] - r.Bn) / r.An; return { q: r.q, f: f, A: r.An, B: r.Bn }; });
    // per q, for the page: amplitude and noise, the compressed rate, and the model curve d(dt) (the headline swimmer
    // model where the q is used, the compressed exponential elsewhere)
    // model curves for the charts on a fine grid of delays (the measured delays plus 120 log-spaced ones), so that
    // they stay smooth where the measured delays are sparse
    const ct = (function () { const a = Array.from(taus); for (let k = 0; k <= 120; k++) a.push(taus[0] * Math.pow(taus[L - 1] / taus[0], k / 120)); a.sort(function (x, y) { return x - y; });
                              return a.filter(function (x, k) { return k === 0 || x > a[k - 1] * (1 + 1e-9); }); })();
    const fits = rows.map(function (r) {
      const taus = ct, L = ct.length;
      const curve = new Float64Array(L), u = r.reason === null && head;
      if (u) { const jj = used.indexOf(r), bq = bOf(head, jj);
               const par = { v: head.v_um_s, alpha: head.alpha, spread: head.spread, D: head.D_um2_s, b: bq, Dr: head.D_r_s, A: head.stroke_um, f: head.stroke_hz }; for (let i = 0; i < L; i++) curve[i] = r.An * (1 - (head === swimDepth ? depthF(r.depth, taus[i], par) : swimF(head === swimStrokeFit ? sk : kind, r.q, taus[i], par))) + r.Bn; }
      else for (let i = 0; i < L; i++) curve[i] = r.A * (1 - Math.exp(-Math.pow(r.gamma_hz * taus[i], r.fixed.beta))) + r.B;
      return { bin: r.bin, q_per_um: r.q, ok: r.ok, reason: r.reason, gamma_fast_hz: r.reason === null && r.gamma_fast ? r.gamma_fast : null, gamma_model_hz: r.reason === null && r.gamma_model ? r.gamma_model : null, gamma_true_hz: r.reason === null && r.gamma_true ? r.gamma_true : null, beta_fast: r.reason === null ? r.beta_fast : null, A: u ? r.An : r.A, B: u ? r.Bn : r.B, gamma_hz: r.gamma_hz, beta: r.fixed.beta, beta_free: r.beta_free, lnGamma_se: r.lnGamma_se, curve: curve };
    });
    const noiseB = NOISE_B;
    D_LIMITS = null; ROT = 6; SHAPE = null; NOISE_B = null; OPTICS = null; DRS = 0; SWIM_DS_FREE = false; DS_MAX = 3;
    return { kind: kind, model: head === swimDepth && swimDepth ? "depth" : head === swimStrokeFit && swimStrokeFit ? "stroke" : kind, lags: S.lags, pairs: S.pairs, times_s: S.times_s, taus_s: taus, curve_taus_s: ct, q_per_um: S.q_per_um, dq: S.dq, d2d: S.d2d, varq: S.varq, B_floor: S.B_floor, B_est: S.B_est, A_est: S.A_est,
             fits: fits, share_from_amplitude: alphaDirect, head: head ? { no_swim: head.no_swim === true, D_fixed: head.D_fixed === true, v_um_s: head.no_swim ? null : head.v_um_s, alpha: head.alpha, spread: head.spread, D_um2_s: head.D_um2_s, turn_share: head.turn_share, turn_perq: head.kind === "still" || head.turn_perq === true, turn_b: head.ab ? head.ab.map(function (x) { return x.b === undefined ? head.turn_share : x.b; }) : null, D_r_s: head.D_r_s, v_rel_err: jk && jk.v !== null && head.v_um_s > 0 ? jk.v / head.v_um_s : head.v_rel_err, alpha_err: jk ? jk.alpha : head.alpha_err, spread_err: jk ? jk.spread : head.spread_err, D_err: jk ? jk.D : null, stroke_um_err: jk && head === swimStrokeFit ? jk.stroke_um : null, stroke_hz_err: jk && head === swimStrokeFit ? jk.stroke_hz : null, err_from: jk ? "jackknife" : "fit", jackknife: jk, stroke_um: head === swimStrokeFit ? head.stroke_um : null, stroke_hz: head === swimStrokeFit ? head.stroke_hz : null, perq: head.perq } : null,
             window: { q_lo_per_um: S.q_lo_per_um, q_hi_per_um: S.q_hi_per_um, q_opt_per_um: S.q_opt_per_um, q_nyq_per_um: S.q_nyq_per_um, gamma_lo_hz: S.gamma_lo_hz, gamma_hi_hz: S.gamma_hi_hz },
             rows: rows.map(function (r) { return { bin: r.bin, q_per_um: r.q, A: r.A, B: r.B, gamma_hz: r.gamma_hz, beta_free: r.beta_free, gamma_free_hz: r.free.gamma_hz, lnGamma_se: r.lnGamma_se, reason: r.reason }; }),
             compressed: comp, fast: fast, collapse: collapse, noise_B: noiseB, swim: strip(swim), swim_depth: strip(swimDepth), swim_stroke: strip(swimStrokeFit), pv: pv, master: master };
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

  const api = { _test: { setOptics: function (o) { OPTICS = o; SHAPE = o ? { optics: true } : null; opticsCache.clear(); }, opticsTable: function (q) { return opticsTable(q); }, opticsAt: function (q) { return opticsAt(q); }, setShape: function (s) { SHAPE = s; shapeCache.clear(); }, shapeWeights: function (q, k) { return shapeWeights(q, k); }, gaussLegendre: function (n) { return gaussLegendre(n); } }, fitStill: fitStill, summary: summary, depthTable: depthTable, depthF: depthF, seenOver: seenOver, analyse: analyse, swimF: swimF, swim3: swim3, swim2: swim2, besselJ0: besselJ0, nnls: nnls, invertCurve: invertCurve, fitSwimGlobal: fitSwimGlobal, fitCompressed: fitCompressed, linAB: linAB };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ACTIVE = api;
})(this);
