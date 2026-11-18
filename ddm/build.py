"""Assemble the DDM pages into self-contained HTML files: the landing page "DDM, hands on" (/ddm/) and one page per
application, "Sizing particles" (/ddm/sizing/) and "Swimming cells" (/ddm/swimmers/).

    python3 ddm/build.py            -> static/ddm/index.html, static/ddm/sizing/index.html, static/ddm/swimmers/index.html
    python3 ddm/build.py --preview  -> ddm/ddm-landing.html, ddm/ddm-hands-on.html, ddm/ddm-swimmers.html
                                       (stand-alone, fonts from Google, linked to each other, for previews)

The site version loads the fonts served by this site (no Google Fonts) and leaves a marker where the site's
build.py writes the main menu, so the menu always matches the other pages.
"""
import re
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


# the pages: landing (/ddm/), sizing (/ddm/sizing/), swimming cells (/ddm/swimmers/) and drifting particles (/ddm/drift/)
PAGES = {
    "landing": {"src": "landing.src.html", "out": "static/ddm/index.html", "preview": "ddm-landing.html", "title": "DDM, hands on",
                "canonical": "https://rcerbino.github.io/ddm/", "up": "../",
                "description": "Differential dynamic microscopy (DDM) hands on: simulated microscopy experiments in your browser, analysed step by step from the raw movie to the result. Size particles from how they move, measure how fast cells swim, or follow particles carried by a flow, gravity or heat.",
                "parts": {}},
    "sizing": {"src": "page.src.html", "out": "static/ddm/sizing/index.html", "preview": "ddm-hands-on.html", "title": "Sizing particles with DDM",
               "canonical": "https://rcerbino.github.io/ddm/sizing/", "up": "../../",
               "description": "Differential dynamic microscopy (DDM) hands on: simulate a microscopy experiment in your browser and size colloidal particles from how they move, step by step, from the raw movie to the result.",
               "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                         "/*ENGINE*/": "ddm-engine.js", "/*WORKER*/": "worker.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app.js"}},
    "swimmers": {"src": "swim.src.html", "out": "static/ddm/swimmers/index.html", "preview": "ddm-swimmers.html", "title": "DDM of swimming cells",
                 "canonical": "https://rcerbino.github.io/ddm/swimmers/", "up": "../../",
                 "description": "Differential dynamic microscopy (DDM) of swimming cells (bacteria, algae, sperm): simulate a motility assay in your browser and measure swimming speeds, step by step, from the raw movie to the distribution of speeds.",
                 "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                           "/*ENGINE*/": "ddm-engine.js", "/*ACTIVE*/": "active-engine.js", "/*WORKER*/": "worker-swim.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-swim.js"}},
    "drift": {"src": "drift.src.html", "out": "static/ddm/drift/index.html", "preview": "ddm-drift.html", "title": "DDM of drifting particles",
              "canonical": "https://rcerbino.github.io/ddm/drift/", "up": "../../",
              "description": "Differential dynamic microscopy (DDM) of particles carried by a flow, by gravity or by a temperature gradient (thermophoresis): simulate the experiment in your browser and measure the speed and direction of the drift, step by step.",
              "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                        "/*ENGINE*/": "ddm-engine.js", "/*DRIFT*/": "drift-engine.js", "/*WORKER*/": "worker-drift.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-drift.js"}},
    "rheology": {"src": "rheo.src.html", "out": "static/ddm/rheology/index.html", "preview": "ddm-rheology.html", "title": "DDM microrheology",
                 "canonical": "https://rcerbino.github.io/ddm/rheology/", "up": "../../",
                 "description": "Differential dynamic microscopy (DDM) microrheology: simulate tracer beads in a soft material in your browser and measure its elastic and viscous moduli, step by step, from the raw movie to G' and G''.",
                 "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*VISCO*/": "visco.js", "/*MOVIE*/": "movie.js",
                           "/*ENGINE*/": "ddm-engine.js", "/*RHEO*/": "rheo-engine.js", "/*WORKER*/": "worker-rheo.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-rheo.js"}},
    "crowded": {"src": "crowd.src.html", "out": "static/ddm/crowded/index.html", "preview": "ddm-crowded.html", "title": "DDM of crowded particles",
                "canonical": "https://rcerbino.github.io/ddm/crowded/", "up": "../../",
                "description": "Differential dynamic microscopy (DDM) of concentrated suspensions: simulate particles that push each other in your browser and measure their structure factor S(q) and collective diffusion D(q), step by step, from the raw movie.",
                "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                          "/*ENGINE*/": "ddm-engine.js", "/*CROWD*/": "crowd-engine.js", "/*WORKER*/": "worker-crowd.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-crowd.js"}},
    "proteins": {"src": "protein.src.html", "out": "static/ddm/proteins/index.html", "preview": "ddm-proteins.html", "title": "DDM of proteins",
                 "canonical": "https://rcerbino.github.io/ddm/proteins/", "up": "../../",
                 "description": "Differential dynamic microscopy (DDM) of proteins: simulate a protein solution in bright field in your browser and measure the size of the proteins and how they interact (k_D and B2), step by step, from the raw movie to a concentration series.",
                 "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*FIELD*/": "field-movie.js",
                           "/*ENGINE*/": "ddm-engine.js", "/*PROTEIN*/": "protein.js", "/*PENGINE*/": "protein-engine.js", "/*WORKER*/": "worker-protein.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-protein.js"}},
    "shear": {"src": "shear.src.html", "out": "static/ddm/shear/index.html", "preview": "ddm-shear.html", "title": "DDM of sheared materials",
              "canonical": "https://rcerbino.github.io/ddm/shear/", "up": "../../",
              "description": "Echo differential dynamic microscopy (echo-DDM) of soft materials under oscillatory shear: simulate tracer beads in a yield-stress gel, a rubber or a viscous liquid in your browser, compare frames a whole cycle apart and see when the material yields.",
              "parts": {"/*OBJECTIVES*/": "data/objectives.min.json", "/*OPTICS*/": "optics.js", "/*MOVIE*/": "movie.js",
                        "/*ENGINE*/": "ddm-engine.js", "/*SHEAR*/": "shear-engine.js", "/*WORKER*/": "worker-shear.js", "/*TIFF*/": "tiff.js", "/*APP*/": "app-shear.js"}},
    "exercises": {"src": "exercises.src.html", "out": "static/ddm/exercises/index.html", "preview": "ddm-exercises.html", "title": "DDM exercises",
                  "canonical": "https://rcerbino.github.io/ddm/exercises/", "up": "../../",
                  "description": "Exercises with model answers on differential dynamic microscopy (DDM): predict, compute and discuss, for each of the DDM, hands on pages, from sizing particles to protein interactions. Printable.",
                  "parts": {}},
}
# links between the pages, as written in the sources (site addresses), and the file each points to in the previews
PREVIEW_LINKS = {
    "shear": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../"': 'href="ddm-landing.html"'},
    "exercises": {'href="../sizing/': 'href="ddm-hands-on.html', 'href="../swimmers/': 'href="ddm-swimmers.html', 'href="../drift/': 'href="ddm-drift.html', 'href="../rheology/': 'href="ddm-rheology.html', 'href="../crowded/': 'href="ddm-crowded.html', 'href="../proteins/': 'href="ddm-proteins.html', 'href="../shear/': 'href="ddm-shear.html', 'href="../"': 'href="ddm-landing.html"'},
    "landing": {'href="shear/': 'href="ddm-shear.html', 'href="exercises/': 'href="ddm-exercises.html', 'href="sizing/': 'href="ddm-hands-on.html', 'href="swimmers/': 'href="ddm-swimmers.html', 'href="drift/': 'href="ddm-drift.html', 'href="rheology/': 'href="ddm-rheology.html', 'href="crowded/': 'href="ddm-crowded.html', 'href="proteins/': 'href="ddm-proteins.html', '"sizing/" + location.hash': '"ddm-hands-on.html" + location.hash'},
    "sizing": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../"': 'href="ddm-landing.html"'},
    "swimmers": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../"': 'href="ddm-landing.html"'},
    "drift": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../"': 'href="ddm-landing.html"'},
    "rheology": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../"': 'href="ddm-landing.html"'},
    "crowded": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../proteins/"': 'href="ddm-proteins.html"', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../"': 'href="ddm-landing.html"'},
    "proteins": {'href="../exercises/': 'href="ddm-exercises.html', 'href="../shear/"': 'href="ddm-shear.html"', 'href="../sizing/"': 'href="ddm-hands-on.html"', 'href="../swimmers/"': 'href="ddm-swimmers.html"', 'href="../drift/"': 'href="ddm-drift.html"', 'href="../rheology/"': 'href="ddm-rheology.html"', 'href="../crowded/"': 'href="ddm-crowded.html"', 'href="../"': 'href="ddm-landing.html"'},
}


# a compact index of the steps at the top of each application page: numbered links that stay in view while the
# reader scrolls, with the title of the step in view (built from the step titles, so it follows the sources)
STEP_INDEX_STYLE = """<style>
.step-index { position: sticky; top: 0; z-index: 6; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.45rem 0; margin-bottom: -1.5rem; background: var(--paper); border-bottom: 1px solid var(--rule); font-size: 0.85rem; }
.step-index ol { display: flex; gap: 0.3rem; list-style: none; margin: 0; padding: 0; }
.step-index a { display: inline-flex; align-items: center; justify-content: center; min-width: 1.9rem; height: 1.9rem; border: 1px solid var(--rule); border-radius: 999px; color: var(--ink); text-decoration: none; font-variant-numeric: tabular-nums; }
.step-index a:hover { border-color: var(--accent); }
.step-index a[aria-current="step"] { background: var(--accent); border-color: var(--accent); color: var(--paper); }
.step-index a.gl { min-width: 0; height: auto; border: 0; padding: 0 0.25rem; color: var(--accent); text-decoration: underline; }
.step-index .now { color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 12rem; }
.step { scroll-margin-top: 3.5rem; }
.glossary { display: grid; grid-template-columns: minmax(10rem, 16rem) 1fr; gap: 0.4rem 1.25rem; margin: 0; max-width: 60rem; }
.glossary dt { font-weight: 600; }
.glossary dd { margin: 0; }
@media (max-width: 40rem) { .glossary { grid-template-columns: 1fr; } .glossary dd { margin-bottom: 0.5rem; } }
@media (max-width: 40rem) { .step-index .now { display: none; } .step-index a { min-width: 1.75rem; height: 1.75rem; } }
</style>
"""
STEP_INDEX_SCRIPT = """<script>
(function () {
  var nav = document.querySelector(".step-index"); if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll("ol a")), now = nav.querySelector(".now");
  var steps = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  function mark() {
    var k = 0, y = nav.getBoundingClientRect().bottom + 40;
    steps.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= y) k = i; });
    links.forEach(function (a, i) { if (i === k) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
    now.textContent = "Step " + (k + 1) + " of " + links.length + ": " + links[k].getAttribute("data-title");
  }
  window.addEventListener("scroll", mark, { passive: true }); window.addEventListener("resize", mark); mark();
})();
</script>
"""


# a short glossary at the end of each application page, shared by all of them
GLOSSARY = [
    ("Numerical aperture (NA)", "How wide a cone of light the objective collects, or the condenser sends: n sin(half-angle). A larger NA resolves finer details and keeps a thinner layer in focus."),
    ("Wave vector q", "Describes a stripe pattern of the image: q = 2&pi; divided by the stripe spacing, in &micro;m<sup>-1</sup>. Not the wave number of the light, k = 2&pi;n/&lambda;."),
    ("Structure function d(q, &Delta;t)", "The average strength of pattern q in the difference of two frames taken &Delta;t apart."),
    ("Amplitude A and noise B", "A(q): how much pattern q changes once the sample has fully renewed it. B: what the camera noise adds, at every delay."),
    ("Intermediate scattering function f(q, &Delta;t)", "How much of pattern q is still there after a delay &Delta;t: 1, all of it; 0, gone."),
    ("Hydrodynamic radius", "The radius of a sphere that would diffuse as the particle or protein does (Stokes-Einstein relation)."),
    ("Self and collective diffusion", "Self: how one particle wanders among the others. Collective: how ripples in the number of particles even out."),
    ("Mean squared displacement", "The average of the squared distance the particles travel in a given time."),
    ("Storage and loss moduli G', G''", "How elastic and how viscous a material is, at an angular frequency &omega; (rad/s; the frequency in hertz is &omega;/2&pi;)."),
    ("Molar mass M", "The mass of one mole of a protein, in g/mol; a protein of 148 kDa has M = 148 000 g/mol."),
    ("Second virial coefficient", "How two molecules interact, on balance: B<sub>2</sub> per pair of molecules (a volume), A<sub>2</sub> = B<sub>2</sub>N<sub>A</sub>/M<sup>2</sup> per gram (mol mL/g<sup>2</sup>), with N<sub>A</sub> Avogadro's number. Positive: they keep apart; negative: they attract."),
    ("Diffusion interaction parameter k<sub>D</sub>", "How fast collective diffusion changes with the concentration: D = D<sub>0</sub>(1 + k<sub>D</sub>c). It holds the interactions and the drag of neighbours through the liquid."),
]


def add_glossary(out):
    anchor = '<section class="wrap further" aria-labelledby="h-about">'
    if anchor not in out:
        return out
    items = "".join("<dt>%s</dt><dd>%s</dd>" % (t, d) for t, d in GLOSSARY)
    sec = ('<section class="wrap further" id="glossary" aria-labelledby="h-glossary">\n    <h2 id="h-glossary">Glossary</h2>\n'
           '    <dl class="glossary">' + items + '</dl>\n  </section>\n\n  ')
    return out.replace(anchor, sec + anchor, 1)


def add_step_index(out):
    if '<div class="steps">' not in out:
        return out
    steps = re.findall(r'<section class="step" id="([^"]+)"[^>]*>\s*<div class="step-title"><span class="num">(\d+)</span><h2 id="[^"]*">(.*?)</h2>', out)
    assert len(steps) >= 5, "step titles not found"
    items = "".join('<li><a href="#%s" data-title="%s" aria-label="Step %s: %s">%s</a></li>' % (sid, re.sub("<[^>]+>", "", t), n, re.sub("<[^>]+>", "", t), n) for sid, n, t in steps)
    nav = '<nav class="step-index" aria-label="Steps on this page"><ol>' + items + '</ol><span class="now" aria-hidden="true"></span><a class="gl" href="#glossary">Glossary</a></nav>\n'
    out = out.replace('<div class="steps">', '<div class="steps">\n      ' + nav, 1)
    out = out.replace("</main>", "</main>\n" + STEP_INDEX_STYLE + STEP_INDEX_SCRIPT, 1)
    return out


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
    out = add_glossary(add_step_index(out))
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
