/*
 * Proteins in solution: how they interact, and what that does to the light they scatter and to how they move.
 *
 * A protein is a hard sphere of its hydrodynamic radius R_h with a net charge Z (screened by the salt, Debye-Hueckel)
 * and a short-range attraction (an attractive Yukawa of depth eps at contact and range delta). In units of kT:
 *   U(r) = infinity                                                    r < sigma = 2 R_h
 *   U(r) = Z^2 lambda_B exp(-kappa (r - sigma)) / [(1 + kappa sigma / 2)^2 r]  -  eps sigma exp(-(r - sigma) / delta) / r
 * From U: the second virial coefficient B2 = 2 pi int (1 - exp(-U)) r^2 dr, written as A2 = B2 N_A / M^2 (mol mL / g^2).
 * To first order in the concentration c (g/mL), as in light scattering:
 *   structure factor at the wave vectors of a microscope (q R_h << 1):  S(0) = 1 / (1 + 2 A2 M c)
 *   collective diffusion:  D_c = D0 (1 + k_D c),  k_D = 2 A2 M - k_H
 * with D0 = kT / (6 pi eta R_h). The hydrodynamic part k_H is that of hard spheres of radius R_h, 6.55 v_h (Batchelor
 * 1972), v_h = 4 pi R_h^3 N_A / (3 M) the hydrodynamic specific volume: hard spheres then give k_D = 1.45 v_h (Batchelor
 * 1976; Felderhof 1978). How the charge and the attraction change the hydrodynamic part is left out.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PROTEIN = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const NA = 6.02214076e23, KB = 1.380649e-23, E = 1.602176634e-19, EPS0 = 8.8541878128e-12;
  const K_H_HS = 6.55;            // hydrodynamic part of k_D for hard spheres, in units of v_h (Batchelor 1972)
  function need(c, msg) { if (!c) throw new Error("Protein: " + msg); }

  // relative permittivity of water (Malmberg and Maryott 1956) and Bjerrum length (nm)
  function epsWater(T_C) { return 87.74 - 0.40008 * T_C + 9.398e-4 * T_C * T_C - 1.41e-6 * T_C * T_C * T_C; }
  function bjerrumNm(T_C) { return E * E / (4 * Math.PI * EPS0 * epsWater(T_C) * KB * (T_C + 273.15)) * 1e9; }
  // Debye screening length (nm) for a monovalent salt of ionic strength I (mol/L)
  function debyeNm(I_M, T_C) { return 1 / Math.sqrt(8 * Math.PI * bjerrumNm(T_C) * I_M * NA * 1e-24); }

  /* p: { M_g_mol, Rh_nm, Z, I_mM, eps_kT, delta_nm, T_C, eta_Pa_s }  ->  everything the page and the movie need */
  function properties(p) {
    need(p.M_g_mol > 1000 && p.M_g_mol < 1e7, "molar mass out of range");
    need(p.Rh_nm > 0.5 && p.Rh_nm < 100, "hydrodynamic radius out of range");
    need(p.I_mM > 0 && p.I_mM <= 3000, "ionic strength out of range");
    const T_C = p.T_C, kT = KB * (T_C + 273.15), lB = bjerrumNm(T_C), kap = 1 / debyeNm(p.I_mM / 1000, T_C);
    const sig = 2 * p.Rh_nm, Z = p.Z || 0, eps = p.eps_kT || 0, del = p.delta_nm || 0.3;
    const elA = Z * Z * lB / Math.pow(1 + kap * sig / 2, 2);
    const U = function (r) { return elA * Math.exp(-kap * (r - sig)) / r - (eps > 0 ? eps * sig * Math.exp(-(r - sig) / del) / r : 0); };
    // B2 = 2 pi [sigma^3 / 3 + int_sigma^inf (1 - e^-U) r^2 dr]: Simpson on a grid fine near contact, out to 40 ranges
    const range = Math.max(1 / kap, eps > 0 ? del : 0, 0.05), rmax = sig + 40 * range;
    let n = 4000; const h = (rmax - sig) / n; let s = 0;
    for (let i = 0; i <= n; i++) { const r = sig + i * h, f = (1 - Math.exp(-U(r))) * r * r, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * f; }
    const B2_nm3 = 2 * Math.PI * (sig * sig * sig / 3 + s * h / 3);
    const M = p.M_g_mol;
    const A2 = B2_nm3 * 1e-21 * NA / (M * M);                       // mol mL / g^2
    const vh = 4 * Math.PI * Math.pow(p.Rh_nm, 3) / 3 * 1e-21 * NA / M; // mL / g
    const B2hs = 2 * Math.PI * sig * sig * sig / 3, A2hs = B2hs * 1e-21 * NA / (M * M);
    const kH = K_H_HS * vh, kD = 2 * A2 * M - kH;                    // mL / g
    const D0 = kT / (6 * Math.PI * p.eta_Pa_s * p.Rh_nm * 1e-9) * 1e12;  // um^2/s
    return {
      M_g_mol: M, Rh_nm: p.Rh_nm, sigma_nm: sig, Z: Z, I_mM: p.I_mM, eps_kT: eps, delta_nm: del, T_C: T_C,
      bjerrum_nm: lB, debye_nm: 1 / kap, U_contact_kT: U(sig), U: U,
      B2_nm3: B2_nm3, A2_mol_mL_g2: A2, A2_hard_mol_mL_g2: A2hs, vh_mL_g: vh, kH_mL_g: kH, kD_mL_g: kD, D0_um2_s: D0,
      // at a concentration c in mg/mL
      S0: function (c) { return 1 / (1 + 2 * A2 * M * c * 1e-3); },
      Dc: function (c) { return D0 * (1 + kD * c * 1e-3); },
      numberDensity_um3: function (c) { return c * 1e-3 * NA / M / 1e12; },
      volumeFraction: function (c) { return c * 1e-3 * vh; },
      // first order holds while these stay well below 1
      firstOrderOK: function (c) { return Math.abs(2 * A2 * M * c * 1e-3) < 0.5 && Math.abs(kD * c * 1e-3) < 0.5; }
    };
  }
  // refractive index of the protein itself, from its refractive index increment and partial specific volume
  function proteinIndex(nLiquid, dndc_mL_g, vbar_mL_g) { return nLiquid + dndc_mL_g / vbar_mL_g; }
  // radius of the dry protein, from its mass and partial specific volume (nm)
  function volumeRadiusNm(M, vbar) { return Math.pow(3 * M * vbar / (4 * Math.PI * NA), 1 / 3) * 1e7; }

  return { properties: properties, proteinIndex: proteinIndex, volumeRadiusNm: volumeRadiusNm, bjerrumNm: bjerrumNm, debyeNm: debyeNm, K_H_HS: K_H_HS };
});
