/* Saving the simulated movie as a multi-page TIFF (32-bit float, one page per frame), readable by ImageJ / Fiji,
 * tifffile and fastDDM. The values are the ones the page analyses (photoelectrons per pixel, noise included).
 * ImageJ reads the pixel size (XResolution, YResolution in pixels per micron) and the frame interval from the
 * description. Nothing leaves the browser: the file is built here and handed to the browser's download. */
(function (root) {
  "use strict";
  function tiff(frames, n, T, pixel_um, dt_s, note) {
    // tags in ascending order, as TIFF requires; 339 = 3: the samples are IEEE floats; 296 = 1: no absolute unit (ImageJ
    // takes the unit from the description)
    const P = n * n, dataBytes = 4 * P;
    let desc = "ImageJ=1.54f\nimages=" + T + "\nframes=" + T + "\nunit=micron\nfinterval=" + dt_s + "\nloop=false\n" + (note ? note.replace(/[^\x20-\x7e\n]/g, "") + "\n" : "");
    desc += "\0"; while (desc.length % 4) desc += "\0";
    const tags = [[254, 4, 0], [256, 4, n], [257, 4, n], [258, 3, 32], [259, 3, 1], [262, 3, 1], [270, 2, null], [273, 4, null],
                  [277, 3, 1], [278, 4, n], [279, 4, dataBytes], [282, 5, null], [283, 5, null], [296, 3, 1], [339, 3, 3]];
    const NT = tags.length, ifdBytes = 2 + 12 * NT + 4, extra = 16;
    const descOff = 8, dataOff = descOff + desc.length, ifdOff0 = dataOff + T * dataBytes;
    const buf = new ArrayBuffer(ifdOff0 + T * (ifdBytes + extra)), v = new DataView(buf), u8 = new Uint8Array(buf);
    v.setUint8(0, 0x49); v.setUint8(1, 0x49); v.setUint16(2, 42, true); v.setUint32(4, ifdOff0, true);
    for (let i = 0; i < desc.length; i++) u8[descOff + i] = desc.charCodeAt(i);
    new Float32Array(buf, dataOff, T * P).set(frames.subarray(0, T * P));
    const num = Math.round(1e6 / pixel_um), den = 1e6;
    for (let t = 0; t < T; t++) {
      const o = ifdOff0 + t * (ifdBytes + extra), rat = o + ifdBytes;
      v.setUint16(o, NT, true);
      tags.forEach(function (g, i) {
        const k = o + 2 + 12 * i, id = g[0], type = g[1];
        let count = 1, val = g[2];
        if (id === 270) { count = t === 0 ? desc.length : 1; val = t === 0 ? descOff : 0; }
        if (id === 273) val = dataOff + t * dataBytes;
        if (id === 282) val = rat; if (id === 283) val = rat + 8;
        v.setUint16(k, id, true); v.setUint16(k + 2, type, true); v.setUint32(k + 4, count, true);
        if (type === 3) v.setUint16(k + 8, val, true); else v.setUint32(k + 8, val, true);
      });
      v.setUint32(o + 2 + 12 * NT, t + 1 < T ? ifdOff0 + (t + 1) * (ifdBytes + extra) : 0, true);
      v.setUint32(rat, num, true); v.setUint32(rat + 4, den, true); v.setUint32(rat + 8, num, true); v.setUint32(rat + 12, den, true);
    }
    return buf;
  }
  // hand a file to the browser's download
  function save(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type: type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  const api = { tiff: tiff, save: save };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DDM_TIFF = api;
})(typeof self !== "undefined" ? self : this);
