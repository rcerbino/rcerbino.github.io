/* Tracer beads in a linear viscoelastic material: the material, the bead's random motion, and the exact answers.
 *
 * The material: a solvent of viscosity eta_s, Maxwell modes (modulus G_k, relaxation time tau_k) and an equilibrium
 * modulus G_inf (a solid when > 0):
 *   G'(w)  = G_inf + sum_k G_k (w tau_k)^2 / (1 + (w tau_k)^2)
 *   G''(w) = eta_s w + sum_k G_k w tau_k / (1 + (w tau_k)^2)
 * The bead (radius a) feels the material through the Stokes friction 6 pi a times the material's response. Each Maxwell
 * mode is a spring k_k = 6 pi a G_k in series with a dashpot k_k tau_k, attached to the bead; G_inf is a spring
 * 6 pi a G_inf to the bead's resting place; the solvent is a dashpot 6 pi a eta_s on the bead. With thermal noise on
 * every dashpot (fluctuation-dissipation) this is an Ornstein-Uhlenbeck process whose mean squared displacement obeys the
 * generalised Stokes-Einstein relation exactly: <dr^2(t)> in 3D = (kT / (pi a)) J(t), with J the creep compliance.
 *
 * The process is solved exactly: with the mobilities M (diagonal) and the stiffness matrix K, z = M^(-1/2) u obeys
 * dz = -S z dt + sqrt(2) dW, S = M^(1/2) K M^(1/2) symmetric; in the eigenvectors of S each coordinate is an independent
 * Ornstein-Uhlenbeck process with rate lambda_j (zero for free diffusion), and the bead's displacement along one axis is
 * u0 = sum_j c_j w_j, c_j = sqrt(M_00) V_0j. Units: um and s, kT = 1.
 *   MSD along one axis = sum_j c_j^2 2 (1 - exp(-lambda_j t)) / lambda_j      (2 t for lambda_j = 0)
 */
(function (root) {
  "use strict";
  const KB = 1.380649e-23;
  function fail(m) { throw new Error("Viscoelastic material: " + m); }

  // eigenvalues and eigenvectors of a symmetric matrix (cyclic Jacobi rotations); A is n x n (array of rows), destroyed
  function jacobi(A) {
    const n = A.length, V = [];
    for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0, tot = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = A[i][j] * A[i][j]; tot += v; if (i !== j) off += v; }
      if (off <= 1e-26 * tot) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q]; if (Math.abs(apq) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * apq), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: A.map(function (r, i) { return r[i]; }), vectors: V };
  }

  function check(mat) {
    if (!mat || typeof mat !== "object") fail("missing");
    const Ginf = mat.G_inf_Pa === undefined ? 0 : mat.G_inf_Pa;
    if (!(Ginf >= 0 && isFinite(Ginf))) fail("G_inf_Pa must be 0 or more");
    const modes = mat.modes || [];
    if (!Array.isArray(modes) || modes.length > 40) fail("modes must be a list of at most 40 [G_Pa, tau_s]");
    modes.forEach(function (m) { if (!(m[0] > 0 && m[1] > 0 && isFinite(m[0]) && isFinite(m[1]))) fail("each mode needs G > 0 and tau > 0"); });
    return { Ginf: Ginf, modes: modes };
  }

  /* The bead's motion in the material: rates lambda_j (1/s) and weights c_j (um) of its independent modes.
   * a_um: bead radius; T_C; eta_s_Pa_s: solvent viscosity (the bead's own Stokes drag in the solvent). */
  function embed(mat, a_um, T_C, eta_s_Pa_s) {
    const m = check(mat), kT = KB * (T_C + 273.15), a = a_um * 1e-6;
    if (!(a > 0 && eta_s_Pa_s > 0)) fail("bead radius and solvent viscosity must be positive");
    const spring = function (G) { return 6 * Math.PI * a * G / kT * 1e-12; };          // 1/um^2 (kT = 1)
    const K = m.modes.length, n = K + 1;
    const mob = new Float64Array(n);
    mob[0] = kT / (6 * Math.PI * eta_s_Pa_s * a) * 1e12;                               // um^2/s: the bead in the solvent
    const S = []; for (let i = 0; i < n; i++) S.push(new Float64Array(n));
    let k0 = spring(m.Ginf);
    m.modes.forEach(function (md, j) {
      const k = spring(md[0]); mob[j + 1] = 1 / (k * md[1]);                            // dashpot k tau
      k0 += k; S[0][j + 1] = S[j + 1][0] = -k; S[j + 1][j + 1] = k;
    });
    S[0][0] = k0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i][j] *= Math.sqrt(mob[i] * mob[j]);
    const e = jacobi(S.map(function (r) { return Array.from(r); }));
    const top = Math.max.apply(null, e.values.map(Math.abs)) || 1;
    const lam = new Float64Array(n), c = new Float64Array(n);
    for (let j = 0; j < n; j++) { lam[j] = e.values[j] < 1e-12 * top ? 0 : e.values[j]; c[j] = Math.sqrt(mob[0]) * e.vectors[0][j]; }
    return { lam: lam, c: c, a_um: a_um, T_C: T_C, eta_s_Pa_s: eta_s_Pa_s, D_s_um2_s: mob[0] };
  }
  // mean squared displacement along one axis (um^2) after t seconds
  function msd1(emb, t) {
    let s = 0;
    for (let j = 0; j < emb.lam.length; j++) { const l = emb.lam[j], c2 = emb.c[j] * emb.c[j]; s += l > 0 ? c2 * 2 * (-Math.expm1(-l * t)) / l : c2 * 2 * t; }
    return s;
  }
  // storage and loss moduli (Pa) at angular frequency w (rad/s)
  function gstar(mat, eta_s_Pa_s, w) {
    const m = check(mat); let g1 = m.Ginf, g2 = eta_s_Pa_s * w;
    m.modes.forEach(function (md) { const x = w * md[1], d = 1 + x * x; g1 += md[0] * x * x / d; g2 += md[0] * x / d; });
    return [g1, g2];
  }
  // zero-shear viscosity (Pa s; Infinity for a solid)
  function eta0(mat, eta_s_Pa_s) { const m = check(mat); if (m.Ginf > 0) return Infinity; return m.modes.reduce(function (s, md) { return s + md[0] * md[1]; }, eta_s_Pa_s); }
  // where G' = G'' (rad/s), searched on a fine log grid between wlo and whi; all crossings, rising and falling
  function crossings(mat, eta_s_Pa_s, wlo, whi) {
    const out = [], N = 600; let prev = null;
    for (let i = 0; i <= N; i++) {
      const w = wlo * Math.pow(whi / wlo, i / N), g = gstar(mat, eta_s_Pa_s, w), d = Math.log(g[0] / g[1]);
      if (prev !== null && isFinite(d) && isFinite(prev.d) && (d > 0) !== (prev.d > 0)) {
        const f = prev.d / (prev.d - d); out.push({ w: prev.w * Math.pow(w / prev.w, f), elastic_above: d > 0 });
      }
      prev = { w: w, d: d };
    }
    return out;
  }

  /* Ready-made spectra. Power law (critical gel, Winter and Chambon): G(t) = S t^-n between tau_min and tau_max,
   * from modes spaced by 2 per decade, g_k = S tau_k^-n dln(tau) / Gamma(n). Rouse: G_p = G_R, tau_p = tau_R / p^2. */
  function gammaFn(x) {   // Lanczos, x > 0
    const g = 7, C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
    x -= 1; let s = C[0]; for (let i = 1; i < g + 2; i++) s += C[i] / (x + i);
    const t = x + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * s;
  }
  function powerLawModes(S, n, tauMin, tauMax, perDecade) {
    const k = perDecade || 2, dl = Math.LN10 / k, N = Math.max(1, Math.round(Math.log10(tauMax / tauMin) * k) + 1), out = [];
    for (let i = 0; i < N; i++) { const tau = tauMin * Math.pow(10, i / k); out.push([S * Math.pow(tau, -n) * dl / gammaFn(n), tau]); }
    return out;
  }
  function rouseModes(G_R, tau_R, P) { const out = []; for (let p = 1; p <= P; p++) out.push([G_R, tau_R / (p * p)]); return out; }

  const api = { embed: embed, msd1: msd1, gstar: gstar, eta0: eta0, crossings: crossings, powerLawModes: powerLawModes, rouseModes: rouseModes, gamma: gammaFn, _jacobi: jacobi };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.VISCO = api;
})(typeof self !== "undefined" ? self : this);
