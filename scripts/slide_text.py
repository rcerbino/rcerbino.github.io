#!/usr/bin/env python3
"""Print the text of a talk file, to identify a talk (title, date, event).

    python3 scripts/slide_text.py FILE [FILE ...]

Works on Keynote (.key, as a zip file or as a folder bundle), PowerPoint
(.pptx) and PDF (needs pdftotext). For Keynote it decodes the slides itself,
so it needs nothing beyond Python 3. Prints, for each file, the slides that
mention "Cerbino" first (usually the title slide), shortest first.
Used by the "Talks list update" scheduled task (see CLAUDE.md).
"""
import os
import re
import subprocess
import sys
import zipfile


def _snappy(b):
    i = n = shift = 0
    while True:
        c = b[i]; i += 1; n |= (c & 0x7F) << shift; shift += 7
        if c < 0x80:
            break
    out = bytearray()
    while i < len(b):
        t = b[i]; i += 1; kind = t & 3
        if kind == 0:
            ln = t >> 2
            if ln >= 60:
                nb = ln - 59; ln = int.from_bytes(b[i:i + nb], "little"); i += nb
            ln += 1; out += b[i:i + ln]; i += ln
            continue
        if kind == 1:
            ln = ((t >> 2) & 7) + 4; off = ((t >> 5) << 8) | b[i]; i += 1
        elif kind == 2:
            ln = (t >> 2) + 1; off = int.from_bytes(b[i:i + 2], "little"); i += 2
        else:
            ln = (t >> 2) + 1; off = int.from_bytes(b[i:i + 4], "little"); i += 4
        for _ in range(ln):
            out.append(out[-off])
    return bytes(out)


def _iwa(b):
    out, i = b"", 0
    while i < len(b):
        ln = int.from_bytes(b[i + 1:i + 4], "little")
        out += _snappy(b[i + 4:i + 4 + ln]); i += 4 + ln
    return out


def _strings(data):
    found = re.findall(rb"[\x20-\x7e\xc2-\xf4][\x20-\x7e\x80-\xbf\xc2-\xf4]{5,}", data)
    keep = []
    for s in found:
        s = s.decode("utf8", "ignore").strip(" *\"")
        if s and not re.match(r"^(com\.|NS|TSWP|TSD|TSK|KN|public\.|apple:|Transition|All at Once|decimal)", s):
            keep.append(s)
    return keep


def keynote(path):
    z = zipfile.ZipFile(os.path.join(path, "Index.zip")) if os.path.isdir(path) else zipfile.ZipFile(path)
    slides = []
    for name in z.namelist():
        if re.match(r"Index/Slide.*\.iwa", name):
            slides.append(" | ".join(_strings(_iwa(z.read(name)))))
    return slides


def pptx(path):
    z = zipfile.ZipFile(path)
    names = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml", n)),
                   key=lambda n: int(re.findall(r"\d+", n)[0]))
    return [" | ".join(re.findall(r"<a:t>([^<]*)</a:t>", z.read(n).decode("utf8", "ignore"))) for n in names[:3]]


def pdf(path):
    txt = subprocess.run(["pdftotext", "-l", "2", path, "-"], capture_output=True, text=True).stdout
    return [" ".join(txt.split())[:800]]


def main(paths):
    for p in paths:
        try:
            low = p.lower().rstrip("/")
            if low.endswith(".key"):
                slides = keynote(p)
            elif low.endswith(".pptx"):
                slides = pptx(p)
            elif low.endswith(".pdf"):
                slides = pdf(p)
            else:
                print(f"### {p}: unsupported file type"); continue
            first = sorted([s for s in slides if "erbino" in s], key=len) or slides[:1]
            print(f"### {p}")
            for s in first[:2]:
                print("   ", s[:600])
        except Exception as e:  # keep going on damaged or old-format files
            print(f"### {p}: could not read ({e})")


if __name__ == "__main__":
    main(sys.argv[1:])
