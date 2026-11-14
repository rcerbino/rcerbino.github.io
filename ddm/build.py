"""Assemble the DDM pages into self-contained HTML files: the landing page "DDM, hands on" (/ddm/) and one page per
application, "Sizing particles" (/ddm/sizing/) and "Swimming cells" (/ddm/swimmers/).

    python3 ddm/build.py            -> static/ddm/index.html, static/ddm/sizing/index.html, static/ddm/swimmers/index.html
    python3 ddm/build.py --preview  -> ddm/ddm-landing.html, ddm/ddm-hands-on.html, ddm/ddm-swimmers.html
                                       (stand-alone, fonts from Google, linked to each other, for previews)

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
SIZING_DESCRIPTION = "Differential dynamic microscopy (DDM) hands on: simulate a microscopy experiment in your browser and size colloidal particles from how they move, step by step, from the raw movie to the result."
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


# the pages: landing (/ddm/), sizing (/ddm/sizing/) and swimming cells (/ddm/swimmers/)
PAGES = {
    "landing": {"src": "landing.src.html", "out": "static/ddm/index.html", "preview": "ddm-landing.html", "title": "DDM, hands on",
                "canonical": "https://rcerbino.github.io/ddm/", "up": "../",
                "description": "Differential dynamic microscopy (DDM) hands on: simulated microscopy experiments in your browser, analysed step by step from the raw movie to the result. Size particles from how they move, or measure how fast cells swim.",
                "parts": {}},
    "sizing": {"src": "page.src.html", "out": "static/ddm/sizing/index.html", "preview": "ddm-hands-on.html", "title": "Sizing particles with DDM",
               "canonical": "https://rcerbino.github.io/ddm/sizing/", "up": "../../",
               "description": "Differential dynamic microscopy (DDM) hands on: simulate a microscopy experiment in your browser and size colloidal particles from how they move, step by step, from the raw movie to the result.",
               "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                         "/*ENGINE*/": "ddm-engine.js", "/*WORKER*/": "worker.js", "/*APP*/": "app.js"}},
    "swimmers": {"src": "swim.src.html", "out": "static/ddm/swimmers/index.html", "preview": "ddm-swimmers.html", "title": "DDM of swimming cells",
                 "canonical": "https://rcerbino.github.io/ddm/swimmers/", "up": "../../",
                 "description": "Differential dynamic microscopy (DDM) of swimming cells (bacteria, algae, sperm): simulate a motility assay in your browser and measure swimming speeds, step by step, from the raw movie to the distribution of speeds.",
                 "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                           "/*ENGINE*/": "ddm-engine.js", "/*ACTIVE*/": "active-engine.js", "/*WORKER*/": "worker-swim.js", "/*APP*/": "app-swim.js"}},
}
# links between the pages, as written in the sources (site addresses), and the file each points to in the previews
PREVIEW_LINKS = {
    "landing": {'href="sizing/': 'href="ddm-hands-on.html', 'href="swimmers/': 'href="ddm-swimmers.html', '"sizing/" + location.hash': '"ddm-hands-on.html" + location.hash'},
    "sizing": {'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../"': 'href="ddm-landing.html"'},
    "swimmers": {'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../"': 'href="ddm-landing.html"'},
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
            .replace(SIZING_DESCRIPTION, cfg["description"]))
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
            for a, b in PREVIEW_LINKS[page].items():
                assert a in html, (page, a)
                html = html.replace(a, b)
            (HERE / cfg["preview"]).write_text(html)
            print("written ddm/" + cfg["preview"])
        else:
            out = ROOT / cfg["out"]
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(site_version(html, page))
            print("written", out.relative_to(ROOT), len(out.read_text()), "bytes")
