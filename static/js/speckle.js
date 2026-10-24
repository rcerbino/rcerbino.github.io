/* A simulated speckle field for the home page banner.
   The field is a sum of plane waves with random directions and a fixed range of
   wave numbers (an annular pupil), so it has real speckle statistics. Each wave's
   phase performs a random walk whose step grows with q^2, as for particles in
   Brownian motion: fine grains change fast, coarse ones slowly. That q-dependent
   decorrelation is exactly what Differential Dynamic Microscopy measures. */
(function () {
  var all = document.querySelectorAll('#speckle, canvas.speckle');
  for (var n = 0; n < all.length; n++) run(all[n]);

function run(canvas) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CELL = parseFloat(canvas.dataset.cell) || 5;   // CSS pixels per simulation cell
  var WAVES = 64;
  var D = 0.04;          // "diffusion coefficient" of the phases, per frame
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var W, H, img, waves, Xr, Xi, Yr, Yi, Er, Ei, I;
  var running = false, visible = true, last = 0;

  function rgb() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--speckle-ink').trim();
    var p = v.split(',').map(function (s) { return parseInt(s, 10); });
    return p.length === 3 && !isNaN(p[0]) ? p : [47, 69, 197];
  }
  var color = rgb();

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function setup() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(40, Math.round(r.width / CELL));
    H = Math.max(20, Math.round(r.height / CELL));
    off.width = W; off.height = H;
    canvas.width = Math.round(r.width * (window.devicePixelRatio || 1));
    canvas.height = Math.round(r.height * (window.devicePixelRatio || 1));
    img = octx.createImageData(W, H);
    waves = [];
    Xr = []; Xi = []; Yr = []; Yi = [];
    for (var j = 0; j < WAVES; j++) {
      var q = 0.35 + 0.75 * Math.random();       // wave number in rad per cell
      var th = Math.random() * 2 * Math.PI;
      var kx = q * Math.cos(th), ky = q * Math.sin(th);
      waves.push({ q2: q * q, phi: Math.random() * 2 * Math.PI });
      var xr = new Float32Array(W), xi = new Float32Array(W);
      for (var x = 0; x < W; x++) { xr[x] = Math.cos(kx * x); xi[x] = Math.sin(kx * x); }
      var yr = new Float32Array(H), yi = new Float32Array(H);
      for (var y = 0; y < H; y++) { yr[y] = Math.cos(ky * y); yi[y] = Math.sin(ky * y); }
      Xr.push(xr); Xi.push(xi); Yr.push(yr); Yi.push(yi);
    }
    Er = new Float32Array(W * H); Ei = new Float32Array(W * H); I = new Float32Array(W * H);
  }

  function frame(dt) {
    Er.fill(0); Ei.fill(0);
    for (var j = 0; j < WAVES; j++) {
      var w = waves[j];
      w.phi += Math.sqrt(2 * D * w.q2 * dt) * gauss();
      var ar = Math.cos(w.phi), ai = Math.sin(w.phi);
      var xr = Xr[j], xi = Xi[j], yr = Yr[j], yi = Yi[j];
      for (var y = 0; y < H; y++) {
        // b = a * exp(i ky y)
        var br = ar * yr[y] - ai * yi[y], bi = ar * yi[y] + ai * yr[y];
        var row = y * W;
        for (var x = 0; x < W; x++) {
          Er[row + x] += br * xr[x] - bi * xi[x];
          Ei[row + x] += br * xi[x] + bi * xr[x];
        }
      }
    }
    var mean = 0, n = W * H, k;
    for (k = 0; k < n; k++) { I[k] = Er[k] * Er[k] + Ei[k] * Ei[k]; mean += I[k]; }
    mean /= n;
    var d = img.data, c0 = color[0], c1 = color[1], c2 = color[2];
    for (k = 0; k < n; k++) {
      var s = I[k] / (I[k] + 1.1 * mean);       // soft saturation of bright grains
      var a = Math.round(255 * Math.pow(s, 1.35));
      d[4 * k] = c0; d[4 * k + 1] = c1; d[4 * k + 2] = c2; d[4 * k + 3] = a;
    }
    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function loop(t) {
    if (!running) return;
    if (t - last > 50) {                          // about 20 frames per second
      frame(Math.min(3, (t - last) / 50 || 1));
      last = t;
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (reduce || running || !visible || document.hidden) return;
    running = true; requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  setup();
  frame(1);
  start();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting; visible ? start() : stop();
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { setup(); frame(1); }, 200);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { color = rgb(); frame(0.01); };
    mq.addEventListener ? mq.addEventListener('change', onScheme) : mq.addListener(onScheme);
  }
}
})();
