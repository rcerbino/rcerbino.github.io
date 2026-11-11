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


DOC_START = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
"""


# the two pages: sizing (/ddm/) and swimming bacteria (/ddm/swimmers/)
PAGES = {
    "sizing": {"src": "page.src.html", "out": "static/ddm/index.html", "preview": "ddm-hands-on.html", "title": "DDM, hands on",
               "canonical": "https://rcerbino.github.io/ddm/", "up": "../",
               "description": "Differential dynamic microscopy (DDM) hands on: simulate a microscopy experiment in your browser and size colloidal particles from how they move, step by step, from the raw movie to the result.",
               "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                         "/*ENGINE*/": "ddm-engine.js", "/*WORKER*/": "worker.js", "/*APP*/": "app.js"}},
    "swimmers": {"src": "swim.src.html", "out": "static/ddm/swimmers/index.html", "preview": "ddm-swimmers.html", "title": "DDM of swimming bacteria",
                 "canonical": "https://rcerbino.github.io/ddm/swimmers/", "up": "../../",
                 "description": "Differential dynamic microscopy (DDM) of swimming bacteria: simulate a motility assay in your browser and measure swimming speeds, step by step, from the raw movie to the distribution of speeds.",
                 "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                           "/*ENGINE*/": "ddm-engine.js", "/*ACTIVE*/": "active-engine.js", "/*WORKER*/": "worker-swim.js", "/*APP*/": "app-swim.js"}},
}


def assemble(page="sizing"):
    cfg = PAGES[page]
    src = (HERE / cfg["src"]).read_text()
    parts = cfg["parts"]
    out = src
    for k, f in parts.items():
        assert k in out, k
        t = (HERE / f).read_text()
        assert "</script" not in t, f
        out = out.replace(k, t)
    # the source is a fragment: give it a document type (standards mode), a character set and a viewport
    # for phones, which the site pages get from templates/base.html
    out = DOC_START + out
    bad = [c for c in out if ord(c) > 127]
    assert not bad, "non-ASCII characters: %r" % sorted(set(bad))
    return out


def site_version(html, page="sizing"):
    cfg = PAGES[page]
    assert GOOGLE_FONTS in html, "font block not found"
    head = (SITE_HEAD.replace("https://rcerbino.github.io/ddm/", cfg["canonical"]).replace('href="../', 'href="' + cfg["up"])
            .replace(PAGES["sizing"]["description"], cfg["description"]))
    html = html.replace(GOOGLE_FONTS, head)
    html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    html = html.replace("<title>" + cfg["title"] + "</title>", "<title>" + cfg["title"] + " | Roberto Cerbino</title>")
    start = html.index('<nav class="site-nav" aria-label="Main">')
    a, b = html.index("<ul>", start), html.index("</ul>", start)
    html = html[:a] + "<ul>\n<!--SITE-NAV-->\n      </ul>" + html[b + len("</ul>"):]
    html = html.replace('<a class="site-name" href="https://rcerbino.github.io/">', '<a class="site-name" href="' + cfg["up"] + '">')
    return html


if __name__ == "__main__":
    for page, cfg in PAGES.items():
        html = assemble(page)
        if "--preview" in sys.argv:
            (HERE / cfg["preview"]).write_text(html)
            print("written ddm/" + cfg["preview"])
        else:
            out = ROOT / cfg["out"]
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(site_version(html, page))
            print("written", out.relative_to(ROOT), len(out.read_text()), "bytes")
