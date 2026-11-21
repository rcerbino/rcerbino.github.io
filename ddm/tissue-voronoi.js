/* The network of nuclei: find the nuclei in every frame, follow them from frame to frame, and draw the Voronoi network
 * they generate (each point of the dish goes to the nearest nucleus). A Voronoi cell is a rough stand-in for the cell
 * outline, the one used by the self-propelled Voronoi model (Bi, Yang, Marchetti and Manning, Phys. Rev. X 6, 021011,
 * 2016); real outlines need a membrane stain.
 *
 * Steps:
 *   1. nuclei: the frame smoothed once with a 3 x 3 binomial kernel; a nucleus is a pixel brighter than every other pixel
 *      within a window of about a third of a cell spacing and above the background plus a quarter of the bright pixels
 *      (median and 99th percentile of the frame); its position to a fraction of a pixel from a parabola through the
 *      logarithm of the three pixels across it, in x and in y (exact for a Gaussian spot);
 *   2. tracks: a nucleus in one frame and one in the next are the same when each is the other's nearest, closer than
 *      half a cell spacing;
 *   3. Voronoi cells: each cell cut out of a square by the perpendicular bisectors towards its neighbours (nearest first),
 *      stopping when the next one is more than twice as far as the farthest corner. In the image a cell is kept only when
 *      every nucleus that could cut it lies inside the field (the corners of the cell less than half way to the edge,
 *      minus a pixel); the truth uses the periodic box of the simulation and keeps every cell;
 *   4. shape index p = perimeter / sqrt(area) (a regular hexagon 3.72, a square 4, a pentagon 3.81; in the vertex and
 *      Voronoi models of tissues p = 3.81 is where the model sheet goes from solid to fluid: Bi et al., Nat. Phys. 11, 1074,
 *      2015; Park et al., Nat. Mater. 14, 1040, 2015), number of sides, fraction of hexagons;
 *   5. neighbours: two cells are neighbours when they share an edge longer than a tenth of the spacing; a neighbour is
 *      kept after a delay when the two still share an edge of any length (the two thresholds stop short edges that flicker
 *      in the noise from counting as exchanges). Over 8 starting frames, for every cell followed in both frames, the
 *      fraction of its neighbours (those still followed) that are kept;
 *   6. displacements from the tracks, relative to the mean of the nuclei followed over the same delay (for comparison
 *      with DDM).
 */
(function (root) {
  "use strict";
  function need(c, m) { if (!c) throw new Error("Network of nuclei: " + m); }

  // ---- 1. nuclei in one frame (positions in um, image coordinates: pixel i spans [i a, (i + 1) a]) ------------------
  // periodic: the frame wraps around (as the simulated one does), for drawing the network as the image would hold it
  function detect(frame, n, a, spacing, periodic) {
    const P = n * n, s1 = new Float64Array(P), sm = new Float64Array(P);
    const ix = periodic ? function (v) { return ((v % n) + n) % n; } : function (v) { return v < 0 ? 0 : v > n - 1 ? n - 1 : v; };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = y * n; s1[r + x] = (2 * frame[r + x] + frame[r + ix(x - 1)] + frame[r + ix(x + 1)]) / 4; }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sm[y * n + x] = (2 * s1[y * n + x] + s1[ix(y - 1) * n + x] + s1[ix(y + 1) * n + x]) / 4;
    const srt = Float64Array.from(sm).sort(), med = srt[Math.floor(P / 2)], p99 = srt[Math.floor(0.99 * P)];
    const thr = med + 0.25 * (p99 - med), w = Math.max(1, Math.round(spacing / 3 / a));
    const X = [], Y = [];
    const lg = function (v) { return Math.log(Math.max(v - med, 1e-3)); };
    const inside = function (v) { return periodic || (v >= 0 && v < n); };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = sm[y * n + x]; if (c <= thr) continue;
      let peak = true;
      for (let dy = -w; dy <= w && peak; dy++) { const yy = y + dy; if (!inside(yy)) continue; for (let dx = -w; dx <= w; dx++) {
        const xx = x + dx; if (!inside(xx) || (dx === 0 && dy === 0)) continue;
        const v = sm[ix(yy) * n + ix(xx)]; if (v > c || (v === c && (dy < 0 || (dy === 0 && dx < 0)))) { peak = false; break; }
      } }
      if (!peak) continue;
      let ox = 0, oy = 0;
      if (periodic || (x > 0 && x < n - 1)) { const l = lg(sm[y * n + ix(x - 1)]), m = lg(c), r = lg(sm[y * n + ix(x + 1)]), d = l - 2 * m + r; if (d < 0) ox = Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / d)); }
      if (periodic || (y > 0 && y < n - 1)) { const l = lg(sm[ix(y - 1) * n + x]), m = lg(c), r = lg(sm[ix(y + 1) * n + x]), d = l - 2 * m + r; if (d < 0) oy = Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / d)); }
      X.push((x + 0.5 + ox) * a); Y.push((y + 0.5 + oy) * a);
    }
    return { x: Float64Array.from(X), y: Float64Array.from(Y) };
  }

  // a grid of buckets for neighbour searches (periodic or not)
  function grid(x, y, L, h, periodic) {
    const nb = Math.max(1, Math.floor(L / h)), cs = L / nb, head = new Int32Array(nb * nb).fill(-1), next = new Int32Array(x.length);
    const cell = function (v) { let c = Math.floor(v / cs); if (periodic) c = ((c % nb) + nb) % nb; return Math.max(0, Math.min(nb - 1, c)); };
    for (let i = 0; i < x.length; i++) { const c = cell(y[i]) * nb + cell(x[i]); next[i] = head[c]; head[c] = i; }
    // every point within range r of (px, py): calls f(j, dx, dy)
    const around = function (px, py, r, f) {
      const k = Math.ceil(r / cs), cx = Math.floor(px / cs), cy = Math.floor(py / cs);
      const kk = periodic ? Math.min(k, Math.floor((nb - 1) / 2)) : k;
      for (let gy = cy - kk; gy <= cy + kk; gy++) for (let gx = cx - kk; gx <= cx + kk; gx++) {
        let ux = gx, uy = gy;
        if (periodic) { ux = ((gx % nb) + nb) % nb; uy = ((gy % nb) + nb) % nb; } else if (gx < 0 || gy < 0 || gx >= nb || gy >= nb) continue;
        for (let j = head[uy * nb + ux]; j >= 0; j = next[j]) {
          let dx = x[j] - px, dy = y[j] - py; if (periodic) { dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L); }
          if (dx * dx + dy * dy <= r * r) f(j, dx, dy);
        }
      }
    };
    return around;
  }

  // ---- 3-5. Voronoi cells of a set of points ------------------------------------------------------------------------
  // returns, for each point: ok (cell complete), area, perim, sides, nb (neighbours sharing a long edge), any (all
  // neighbours sharing an edge), poly (corners, relative to the point) when keepPoly
  function voronoi(x, y, L, spacing, periodic, keepPoly) {
    const N = x.length, rc = 3 * spacing, around = grid(x, y, L, rc, periodic), minEdge = 0.1 * spacing, edgeMargin = periodic ? 0 : L / 400;
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const cand = [];
      around(x[i], y[i], rc, function (j, dx, dy) { if (j !== i) cand.push([dx * dx + dy * dy, dx, dy, j]); });
      cand.sort(function (p, q) { return p[0] - q[0]; });
      let px = [-rc, rc, rc, -rc], py = [-rc, -rc, rc, rc], lab = [-1, -1, -1, -1];
      let rmax = rc * Math.SQRT2, complete = false;
      for (let c = 0; c < cand.length; c++) {
        const d2 = cand[c][0];
        if (Math.sqrt(d2) > 2 * rmax) { complete = true; break; }
        const nx = cand[c][1], ny = cand[c][2], lim = d2 / 2, j = cand[c][3];
        const qx = [], qy = [], ql = [], m = px.length;
        for (let k = 0; k < m; k++) {
          const k2 = (k + 1) % m, sa = nx * px[k] + ny * py[k] - lim, sb = nx * px[k2] + ny * py[k2] - lim;
          if (sa <= 0) { qx.push(px[k]); qy.push(py[k]); ql.push(lab[k]); if (sb > 0) { const u = sa / (sa - sb); qx.push(px[k] + u * (px[k2] - px[k])); qy.push(py[k] + u * (py[k2] - py[k])); ql.push(j); } }
          else if (sb <= 0) { const u = sa / (sa - sb); qx.push(px[k] + u * (px[k2] - px[k])); qy.push(py[k] + u * (py[k2] - py[k])); ql.push(lab[k]); }
        }
        if (qx.length === m && ql.every(function (v, k) { return v === lab[k]; })) continue;
        px = qx; py = qy; lab = ql;
        rmax = 0; for (let k = 0; k < px.length; k++) rmax = Math.max(rmax, Math.hypot(px[k], py[k]));
      }
      if (!complete && 2 * rmax <= rc) complete = true;
      let ok = complete && lab.indexOf(-1) < 0;
      if (ok && !periodic) ok = x[i] - 2 * rmax > edgeMargin && y[i] - 2 * rmax > edgeMargin && L - x[i] - 2 * rmax > edgeMargin && L - y[i] - 2 * rmax > edgeMargin;
      if (!ok) { out[i] = keepPoly === "all" ? { ok: false, px: px.map(function (v) { return v + x[i]; }), py: py.map(function (v) { return v + y[i]; }), lab: lab } : { ok: false }; continue; }
      let A = 0, Pm = 0; const nb = [], any = [];
      for (let k = 0; k < px.length; k++) {
        const k2 = (k + 1) % px.length, e = Math.hypot(px[k2] - px[k], py[k2] - py[k]);
        A += px[k] * py[k2] - px[k2] * py[k]; Pm += e;
        if (any.indexOf(lab[k]) < 0) any.push(lab[k]);
        if (e > minEdge && nb.indexOf(lab[k]) < 0) nb.push(lab[k]);
      }
      A = Math.abs(A) / 2;
      const o = { ok: true, area: A, perim: Pm, p: Pm / Math.sqrt(A), sides: nb.length, nb: nb, any: any };
      if (keepPoly) { o.px = px.map(function (v) { return v + x[i]; }); o.py = py.map(function (v) { return v + y[i]; }); o.lab = lab; }
      out[i] = o;
    }
    return out;
  }

  // ---- 2. tracks: mutual nearest neighbours between consecutive frames ----------------------------------------------
  function link(det, L, dmax) {
    const T = det.length, id = []; let nextId = 0;
    id.push(Int32Array.from(det[0].x, function () { return nextId++; }));
    for (let t = 0; t + 1 < T; t++) {
      const A = det[t], B = det[t + 1], nA = A.x.length, nB = B.x.length;
      const aroundB = grid(B.x, B.y, L, dmax, false), aroundA = grid(A.x, A.y, L, dmax, false);
      const bestB = new Int32Array(nA).fill(-1), bestA = new Int32Array(nB).fill(-1);
      for (let i = 0; i < nA; i++) { let bd = Infinity; aroundB(A.x[i], A.y[i], dmax, function (j, dx, dy) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; bestB[i] = j; } }); }
      for (let j = 0; j < nB; j++) { let bd = Infinity; aroundA(B.x[j], B.y[j], dmax, function (i, dx, dy) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; bestA[j] = i; } }); }
      const ids = new Int32Array(nB);
      for (let j = 0; j < nB; j++) { const i = bestA[j]; ids[j] = (i >= 0 && bestB[i] === j) ? id[t][i] : nextId++; }
      id.push(ids);
    }
    return id;
  }

  // ---- 4-6 over a movie ----------------------------------------------------------------------------------------------
  // pts(t) -> {x, y, id}: points of frame t with identities; periodic: the truth
  function network(pts, T, L, spacing, frameH, periodic) {
    const lagsF = [1, 2, 3, 6, 12, 24, 48, 96, 192].filter(function (k) { return k < T; });
    const maxLag = lagsF[lagsF.length - 1], nStart = 8;
    const starts = []; for (let s = 0; s < nStart; s++) starts.push(Math.round(s * (T - 1 - maxLag) / Math.max(1, nStart - 1)));
    const cache = {};
    const cellsAt = function (t) {
      if (cache[t]) return cache[t];
      const q = pts(t), v = voronoi(q.x, q.y, L, spacing, periodic, false), byId = new Map();
      for (let i = 0; i < q.x.length; i++) byId.set(q.id[i], i);
      return (cache[t] = { q: q, v: v, byId: byId });
    };
    // shape and sides over frames spread through the movie
    const pBins = 40, pLo = 3.5, pHi = 4.5, pHist = new Float64Array(pBins), sHist = new Float64Array(11);
    let pSum = 0, pSq = 0, nC = 0, nHex = 0, nOk = 0, nAll = 0;
    const statFrames = []; for (let t = 0; t < T; t += Math.max(1, Math.floor(T / 16))) statFrames.push(t);
    statFrames.forEach(function (t) {
      const c = cellsAt(t); nAll += c.q.x.length;
      c.v.forEach(function (o) {
        if (!o.ok) return; nOk++;
        pSum += o.p; pSq += o.p * o.p; nC++;
        const b = Math.floor((o.p - pLo) / (pHi - pLo) * pBins); if (b >= 0 && b < pBins) pHist[b]++;
        sHist[Math.min(10, o.sides)]++; if (o.sides === 6) nHex++;
      });
    });
    // neighbours kept, and displacements relative to the followed nuclei
    const kept = lagsF.map(function (k) {
      let num = 0, den = 0, cells = 0;
      starts.forEach(function (t0) {
        const A = cellsAt(t0), B = cellsAt(t0 + k);
        A.v.forEach(function (o, i) {
          if (!o.ok) return; const jB = B.byId.get(A.q.id[i]); if (jB === undefined || !B.v[jB].ok) return;
          const anyB = B.v[jB].any; let n0 = 0, n1 = 0;
          o.nb.forEach(function (m) { const mB = B.byId.get(A.q.id[m]); if (mB === undefined) return; n0++; if (anyB.indexOf(mB) >= 0) n1++; });
          if (n0) { num += n1; den += n0; cells++; }
        });
      });
      return { lag_h: k * frameH, kept: cells >= 100 ? num / den : null, cells: cells };   // fewer cells: the sheet has carried most of them out of the field
    });
    const msd = [];
    for (let k = 1; k < T; k = Math.max(k + 1, Math.round(k * 1.25))) {
      let s = 0, c = 0;
      for (let t = 0; t + k < T; t += Math.max(1, Math.floor((T - k) / 32))) {
        const A = pts(t), B = pts(t + k), map = new Map(); for (let j = 0; j < B.x.length; j++) map.set(B.id[j], j);
        const dx = [], dy = [];
        for (let i = 0; i < A.x.length; i++) { const j = map.get(A.id[i]); if (j === undefined) continue; let ex = B.x[j] - A.x[i], ey = B.y[j] - A.y[i]; if (periodic) { ex -= L * Math.round(ex / L); ey -= L * Math.round(ey / L); } dx.push(ex); dy.push(ey); }
        if (dx.length < 20) continue;
        const mx = dx.reduce(function (p, v) { return p + v; }, 0) / dx.length, my = dy.reduce(function (p, v) { return p + v; }, 0) / dy.length;
        for (let i = 0; i < dx.length; i++) { s += (dx[i] - mx) * (dx[i] - mx) + (dy[i] - my) * (dy[i] - my); c++; }
      }
      if (c < 200) break;   // too few nuclei followed this long
      msd.push([k * frameH, s / c]);
    }
    const pm = nC ? pSum / nC : null;
    return { p_mean: pm, p_sd: nC > 1 ? Math.sqrt(Math.max(0, pSq / nC - pm * pm)) : null, p_hist: { lo: pLo, hi: pHi, counts: Array.from(pHist) },
      sides_hist: Array.from(sHist), hex_frac: nC ? nHex / nC : null, cells_measured: nC, frames_measured: statFrames.length, kept_frac: nAll ? nOk / nAll : null,
      kept: kept, msd: { lag_h: msd.map(function (v) { return v[0]; }), um2: msd.map(function (v) { return v[1]; }) } };
  }

  // opts: spacing_um (the cell size), show_frame (frame drawn on the page, default 0)
  function* analyse(movie, opts) {
    opts = opts || {};
    need(movie && movie.frames && movie.n, "no movie");
    const n = movie.n, T = movie.T, a = movie.pixel_um, L = movie.L_um, P = n * n, spacing = opts.spacing_um || 15, fh = movie.frame_h;
    const det = [];
    for (let t = 0; t < T; t++) { det.push(detect(movie.frames.subarray(t * P, (t + 1) * P), n, a, spacing)); if (t % 16 === 15) yield { stage: "Finding the nuclei", frac: 0.45 * (t + 1) / T }; }
    const ids = link(det, L, 0.5 * spacing);
    yield { stage: "Following the nuclei", frac: 0.5 };
    const meas = network(function (t) { return { x: det[t].x, y: det[t].y, id: ids[t] }; }, T, L, spacing, fh, false);
    yield { stage: "Drawing the network", frac: 0.75 };
    // track lengths: how many frames a nucleus is followed for, on average
    const span = new Map(); for (let t = 0; t < T; t++) ids[t].forEach(function (v) { span.set(v, (span.get(v) || 0) + 1); });
    let sl = 0; span.forEach(function (v) { sl += v; });
    meas.n_detected = det.reduce(function (p, d) { return p + d.x.length; }, 0) / T;
    meas.track_frames = sl / span.size;
    // the frame drawn on the page: nuclei and complete cells
    const sf = Math.max(0, Math.min(T - 1, opts.show_frame || 0)), vs = voronoi(det[sf].x, det[sf].y, L, spacing, false, true);
    meas.frame = { t: sf, x: Array.from(det[sf].x), y: Array.from(det[sf].y),
      cells: vs.map(function (o, i) { return o.ok ? { i: i, px: o.px, py: o.py, sides: o.sides, p: o.p } : null; }).filter(Boolean) };
    let truth = null;
    const tp = movie.truth && movie.truth.positions;
    if (tp) {
      const Nt = tp.x.length / T, idT = Int32Array.from({ length: Nt }, function (_, i) { return i; });
      truth = network(function (t) { return { x: tp.x.subarray(t * Nt, (t + 1) * Nt), y: tp.y.subarray(t * Nt, (t + 1) * Nt), id: idT }; }, T, L, spacing, fh, true);
      // how well the nuclei were found: each true nucleus of the drawn frame against the nearest found one
      const X = tp.x.subarray(sf * Nt, (sf + 1) * Nt), Y = tp.y.subarray(sf * Nt, (sf + 1) * Nt), around = grid(det[sf].x, det[sf].y, L, spacing, false);
      let found = 0, e2 = 0, inner = 0;
      for (let i = 0; i < Nt; i++) {
        if (X[i] < spacing / 2 || Y[i] < spacing / 2 || X[i] > L - spacing / 2 || Y[i] > L - spacing / 2) continue;
        inner++; let bd = Infinity; around(X[i], Y[i], spacing / 2, function (j, dx, dy) { bd = Math.min(bd, dx * dx + dy * dy); });
        if (bd < Infinity) { found++; e2 += bd; }
      }
      truth.found_frac = inner ? found / inner : null; truth.loc_err_um = found ? Math.sqrt(e2 / found) : null; truth.n_cells = Nt;
    }
    yield { stage: "Drawing the network", frac: 1 };
    return { measured: meas, truth: truth, spacing_um: spacing, L_um: L };
  }

  // ---- the movie analysed by DDM: the nuclei, the cell edges, or both -------------------------------------------------
  // The edges are the Voronoi network of the nuclei found in each frame, drawn as a stain of the cell edges would show it.
  // The simulated image wraps around (a nucleus leaving on one side comes back on the other), so the nuclei are found and
  // the network drawn the same way (periodic Voronoi network, edges wrapped); otherwise the frame of the field would add
  // patterns that never move, and the sheet would seem to move less. Edges:
  // lines of rms width 1.5 um, as much light per cell as a nucleus (photons over 1.67 cell sizes of
  // edge, about half the perimeter of a cell), the same background, shot noise and read noise of the camera. "both" adds the
  // light of the edges to the frames of the nuclei, as two stains seen together.
  // A stained cell edge seen from above through a 10x objective is a blurred line: the lateral membranes are not quite
  // vertical, and light from above and below the focus adds. 1.5 um rms also keeps the line wider than half a pixel, so
  // that sampling it at the pixel centres does not lock part of its light to the pixels (that would hide the motion of the
  // sheet: the network of a packed sheet has almost no wide patterns of its own).
  const EDGE_RMS_UM = 1.5;
  // a nucleus found twice (within a third of a spacing) counted once
  function dedupe(x, y, L, spacing) {
    const around = grid(x, y, L, spacing, true), keep = [], r = 0.35 * spacing;
    for (let i = 0; i < x.length; i++) { let dup = false; around(x[i], y[i], r, function (j) { if (j < i) dup = true; }); if (!dup) keep.push(i); }
    return { x: Float64Array.from(keep, function (i) { return x[i]; }), y: Float64Array.from(keep, function (i) { return y[i]; }) };
  }
  // standard normal cumulative (Abramowitz and Stegun 7.1.26, error below 2e-7)
  function Phi(z) { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x), e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e); }
  // each edge a line of Gaussian profile across, with soft ends along (so that three edges add up smoothly at a corner)
  function edgeImage(x0, y0, n, a, L, spacing, lambda, out) {
    const d = dedupe(x0, y0, L, spacing), x = d.x, y = d.y;
    const cells = voronoi(x, y, L, spacing, true, "all"), w = EDGE_RMS_UM, R = 3.5 * w, inv = 1 / (2 * w * w), amp = lambda * a * a / (Math.sqrt(2 * Math.PI) * w);
    for (let i = 0; i < cells.length; i++) {
      const o = cells[i]; if (!o.px) continue;
      const m = o.px.length;
      for (let k = 0; k < m; k++) {
        const j = o.lab[k]; if (j < 0 || j < i) continue;     // each edge once, and only between two nuclei
        const x1 = o.px[k], y1 = o.py[k], x2 = o.px[(k + 1) % m], y2 = o.py[(k + 1) % m], len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1e-9) continue;
        const tx = (x2 - x1) / len, ty = (y2 - y1) / len;
        const p0 = Math.floor((Math.min(x1, x2) - R) / a), p1 = Math.floor((Math.max(x1, x2) + R) / a);
        const q0 = Math.floor((Math.min(y1, y2) - R) / a), q1 = Math.floor((Math.max(y1, y2) + R) / a);
        for (let py = q0; py <= q1; py++) for (let px = p0; px <= p1; px++) {
          const cx = (px + 0.5) * a - x1, cy = (py + 0.5) * a - y1, dd = -ty * cx + tx * cy, ss = tx * cx + ty * cy;
          if (Math.abs(dd) > R || ss < -R || ss > len + R) continue;
          out[(((py % n) + n) % n) * n + ((px % n) + n) % n] += amp * Math.exp(-dd * dd * inv) * (Phi((len - ss) / w) - Phi(-ss / w));
        }
      }
    }
  }
  // movie: the movie of the nuclei; mode "edges" or "both"; cfg: photons, background, cell_um (as given to the
  // simulation), seed
  function* channelMovie(movie, mode, cfg) {
    need(mode === "edges" || mode === "both", "unknown images: " + mode);
    const n = movie.n, T = movie.T, P = n * n, a = movie.pixel_um, L = movie.L_um, rd = movie.info.read_noise_e;
    const lambda = cfg.photons / (1.67 * cfg.cell_um), bg = cfg.background;
    const MV = (typeof module !== "undefined" && module.exports) ? require("./tissue-movie.js") : root.TISSUE_MOVIE;
    let s = ((cfg.seed >>> 0) + (mode === "edges" ? 104723 : 130363)) >>> 0 || 1;
    const u = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    let spare = null;
    const g = function () { if (spare !== null) { const v = spare; spare = null; return v; } let p, q, r; do { p = 2 * u() - 1; q = 2 * u() - 1; r = p * p + q * q; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = q * f; return p * f; };
    const frames = new Float32Array(T * P), fft = new Float64Array(2 * T * P), img = new Float64Array(P);
    for (let t = 0; t < T; t++) {
      const d = detect(movie.frames.subarray(t * P, (t + 1) * P), n, a, cfg.cell_um, true);
      img.fill(0); edgeImage(d.x, d.y, n, a, L, cfg.cell_um, lambda, img);
      const o = t * P;
      if (mode === "edges") for (let p = 0; p < P; p++) { const m = img[p] + bg; frames[o + p] = Math.max(0, m + Math.sqrt(m) * g()) + rd * g(); }
      else for (let p = 0; p < P; p++) { const m = img[p]; frames[o + p] = movie.frames[o + p] + Math.max(0, m + Math.sqrt(m) * g()); }
      MV.fft2(frames.subarray(o, o + P), n, fft, 2 * o);
      if (t % 16 === 15) yield { stage: mode === "edges" ? "Drawing the cell edges" : "Adding the cell edges", frac: (t + 1) / T };
    }
    return Object.assign({}, movie, { frames: frames, fft: fft, channel: mode });
  }

  const api = { analyse: analyse, detect: detect, voronoi: voronoi, link: link, channelMovie: channelMovie, edgeImage: edgeImage };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TISSUE_VORONOI = api;
})(typeof self !== "undefined" ? self : this);
