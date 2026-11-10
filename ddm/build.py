"""Assemble the DDM page ("DDM, hands on") into one self-contained HTML file.

    python3 ddm/build.py            -> static/ddm/index.html (the version served at /ddm/ on this site)
    python3 ddm/build.py --preview  -> ddm/ddm-hands-on.html (stand-alone, fonts from Google, for previews)

The site version loads the fonts served by this site (no Google Fonts) and leaves a marker where the site's
build.py writes the main menu, so the menu always matches the other pages.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GOOGLE_FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap">"""
SITE_HEAD = """<meta name="description" content="Differential dynamic microscopy (DDM) hands on: simulate a microscopy experiment in your browser and size colloidal particles from how they move, step by step, from the raw movie to the result.">
<meta name="author" content="Roberto Cerbino">
<link rel="canonical" href="https://rcerbino.github.io/ddm/">
<link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../css/fonts.css">"""


def assemble():
    src = (HERE / "page.src.html").read_text()
    parts = {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
             "/*ENGINE*/": "ddm-engine.js", "/*WORKER*/": "worker.js", "/*APP*/": "app.js"}
    out = src
    for k, f in parts.items():
        assert k in out, k
        t = (HERE / f).read_text()
        assert "</script" not in t, f
        out = out.replace(k, t)
    bad = [c for c in out if ord(c) > 127]
    assert not bad, "non-ASCII characters: %r" % sorted(set(bad))
    return out


def site_version(html):
    assert GOOGLE_FONTS in html, "font block not found"
    html = html.replace(GOOGLE_FONTS, SITE_HEAD)
    html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    html = html.replace("<title>DDM, hands on</title>", "<title>DDM, hands on | Roberto Cerbino</title>")
    start = html.index('<nav class="site-nav" aria-label="Main">')
    a, b = html.index("<ul>", start), html.index("</ul>", start)
    html = html[:a] + "<ul>\n<!--SITE-NAV-->\n      </ul>" + html[b + len("</ul>"):]
    html = html.replace('<a class="site-name" href="https://rcerbino.github.io/">', '<a class="site-name" href="../">')
    return html


if __name__ == "__main__":
    html = assemble()
    if "--preview" in sys.argv:
        (HERE / "ddm-hands-on.html").write_text(html)
        print("written ddm/ddm-hands-on.html")
    else:
        out = ROOT / "static" / "ddm" / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(site_version(html))
        print("written", out.relative_to(ROOT), len(out.read_text()), "bytes")
