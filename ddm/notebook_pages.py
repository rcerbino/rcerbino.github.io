# -*- coding: utf-8 -*-
"""Readable pages for the notebooks (/ddm/notebooks/<name>/): each notebook, run on its page's standard movie, turned into a
page of the site with the text, the code, the numbers it prints and its plots, a button to download the notebook and a link
that opens it in Google Colab.

Usage: run every notebook in static/ddm/notebooks/ on its standard movie and save the run copies as exec-ddm-<name>.ipynb
in one folder (jupyter nbconvert --to notebook --execute ddm-<name>.ipynb --output exec-ddm-<name>.ipynb), then

    python3 ddm/notebook_pages.py <that folder>

It writes ddm/notebooks/<name>.src.html; python3 ddm/build.py then makes static/ddm/notebooks/<name>/index.html. The pages
must stay ASCII: anything else is written as an HTML entity. The plots are embedded as PNG data."""
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = "rcerbino/rcerbino.github.io"

# name of the notebook: (page address under /ddm/, title of the page, short description for search engines)
NOTEBOOKS = {
    "sizing": ("sizing", "Sizing particles",
               "A complete Python notebook for DDM, hands on: the size of colloidal particles from a downloaded microscope movie, with fastDDM, every input and step written out, run on the page's standard movie."),
    "swimmers": ("swimmers", "Swimming cells",
                 "A complete Python notebook for DDM, hands on: the swimming speed and the share of swimmers from a downloaded microscope movie, with the model of Wilson et al. (2011)."),
    "drift": ("drift", "Drifting particles",
              "A complete Python notebook for DDM, hands on: the speed and direction of a drift, and the diffusion of the particles, from a downloaded microscope movie."),
    "rheology": ("rheology", "Liquid or solid",
                 "A complete Python notebook for DDM, hands on: microrheology from a downloaded microscope movie, from the structure function to the storage and loss moduli."),
    "crowded": ("crowded", "Crowded particles",
                "A complete Python notebook for DDM, hands on: the structure factor and the collective diffusion of a concentrated suspension from two downloaded microscope movies."),
    "proteins": ("proteins", "Proteins",
                 "A complete Python notebook for DDM, hands on: the size and the interactions of proteins from five downloaded bright-field movies."),
    "shear": ("shear", "Sheared materials",
              "A complete Python notebook for DDM, hands on: echo-DDM of a material under oscillatory shear, along the flow and along the vorticity, from a downloaded movie."),
    "tissues": ("tissues", "Moving tissues",
                "A complete Python notebook for DDM, hands on: the motion of a cell sheet, the displacement of the cells relative to it and its state, from a downloaded time-lapse movie."),
}

CSS = """
.nb { padding-block: 0 2.5rem; }
.nb-tools { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; font-family: var(--sans); font-size: 0.92rem; margin: 0 0 1.25rem; }
.nb-tools a.btn { font-weight: 600; color: var(--accent); background: var(--panel); border: 1px solid var(--accent); border-radius: 6px; padding: 0.35rem 0.8rem; text-decoration: none; }
.nb-tools a.btn:hover { background: var(--tint); }
.nb-tools a.btn.primary { background: var(--accent); color: var(--paper); }
.how { font-family: var(--sans); font-size: 0.9rem; line-height: 1.55; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); padding: 0.8rem 1rem; max-width: 46rem; margin: 0 0 1.5rem; }
.how p { margin: 0 0 0.4rem; } .how p:last-child { margin: 0; }
.how code { font-size: 0.85rem; }
.cell-md { max-width: 46rem; overflow-wrap: anywhere; }
.cell-md h1 { display: none; }
.cell-md h2 { font-size: 1.45rem; margin: 2rem 0 0.5rem; }
.cell-md code, .how code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; background: var(--tint); padding: 0.05em 0.3em; border-radius: 3px; }
pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82rem; line-height: 1.5; margin: 0 0 1rem; padding: 0.75rem 0.9rem; border-radius: 6px; overflow-x: auto; max-width: 60rem; }
pre.code { background: var(--tint); border: 1px solid var(--rule); }
pre.out { background: var(--panel); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; color: var(--ink); white-space: pre-wrap; }
.out-label { font-family: var(--sans); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: -0.4rem 0 0.25rem; }
figure.plot { margin: 0 0 1.25rem; max-width: 60rem; }
figure.plot img { display: block; max-width: 100%; height: auto; background: #fff; border: 1px solid var(--rule); border-radius: 6px; }
.code .k, .code .kn, .code .kc, .code .ow, .code .kd { color: var(--accent); font-weight: 600; }
.code .s, .code .s1, .code .s2, .code .sd, .code .sa, .code .si, .code .se { color: var(--accent-2); }
.code .c, .code .c1, .code .cm, .code .ch { color: var(--muted); font-style: italic; }
.code .nf, .code .nb, .code .bp { color: var(--ink); font-weight: 600; }
.code .mi, .code .mf, .code .mh, .code .mo { color: var(--accent-2); }
"""


def ascii(s):
    """Non-ASCII characters as HTML entities (the build refuses anything else)."""
    return s.encode("ascii", "xmlcharrefreplace").decode("ascii")


def head_from_exercises(title):
    src = (HERE / "exercises.src.html").read_text()
    start = src.index("<title>")
    end = src.index("</header>") + len("</header>")
    part = src[start:end].replace("<title>DDM exercises</title>", "<title>" + html.escape(title) + "</title>")
    part = part.replace("</style>", CSS + "</style>", 1)
    return part


def render(name, nb_path):
    import markdown                      # needed only to write the pages, not by ddm/build.py
    from pygments import highlight
    from pygments.formatters import HtmlFormatter
    from pygments.lexers import PythonLexer
    page, page_title, _ = NOTEBOOKS[name]
    nb = json.loads(Path(nb_path).read_text())
    cells = nb["cells"]
    first = "".join(cells[0]["source"])
    h1 = re.search(r"^# (.+)$", first, re.M).group(1)
    h1 = re.sub(r"^DDM, hands on: ", "", h1)
    h1 = h1[0].upper() + h1[1:]
    pip = re.search(r"`pip install ([^`]+)`", first)
    pkgs = pip.group(1) if pip else "numpy tifffile matplotlib"
    md = markdown.Markdown(extensions=["tables"])
    fmt = HtmlFormatter(nowrap=True)
    body = []
    last_md_text = ""
    for c in cells:
        src = "".join(c["source"])
        if c["cell_type"] == "markdown":
            md.reset()
            # angle brackets in the text are averages (<dr^2>, <A>), not tags: escape them outside code spans
            parts = re.split(r"(`[^`]*`)", src)
            src_md = "".join(x if x.startswith("`") else x.replace("<", "&lt;").replace(">", "&gt;") for x in parts)
            body.append('<div class="cell-md">' + md.convert(src_md) + "</div>")
            last_md_text = re.sub(r"[#*`\[\]]", "", src).strip().split("\n")[0]
            continue
        body.append('<pre class="code" tabindex="0" aria-label="Code"><code>' + highlight(src, PythonLexer(), fmt).rstrip("\n") + "</code></pre>")
        texts, images = [], []
        for o in c.get("outputs", []):
            if o.get("output_type") == "stream":
                texts.append("".join(o["text"]))
            elif o.get("output_type") in ("execute_result", "display_data"):
                d = o.get("data", {})
                if "image/png" in d:
                    images.append(d["image/png"].replace("\n", ""))
                elif "text/plain" in d:
                    t = "".join(d["text/plain"])
                    if not t.startswith("<") and not t.startswith("Text("):
                        texts.append(t + "\n")
            elif o.get("output_type") == "error":
                raise SystemExit("%s: the run stopped with an error: %s" % (nb_path, o.get("ename")))
        if texts:
            body.append('<p class="out-label">Output</p><pre class="out" tabindex="0" aria-label="Output">' + html.escape("".join(texts).rstrip("\n")) + "</pre>")
        for k, img in enumerate(images):
            alt = "Plot: " + (last_md_text if last_md_text else "result")
            body.append('<figure class="plot"><img src="data:image/png;base64,' + img + '" alt="' + html.escape(alt) + '" loading="lazy"></figure>')
    ipynb = "ddm-%s.ipynb" % name
    colab = "https://colab.research.google.com/github/%s/blob/main/static/ddm/notebooks/%s" % (REPO, ipynb)
    title = h1 + " - notebook"
    out = head_from_exercises(title) + """

<main>
  <section class="wrap intro">
    <p class="eyebrow">DDM, hands on &middot; notebook for <a href="../../%(page)s/">%(page_title)s</a></p>
    <h1>%(h1)s</h1>
    <div class="nb-tools">
      <a class="btn primary" href="../%(ipynb)s" download>Download the notebook (.ipynb)</a>
      <a class="btn" href="%(colab)s" rel="noopener">Open in Google Colab</a>
      <a href="../../%(page)s/">Back to the page</a>
    </div>
    <div class="how">
      <p><b>What you see here</b> is the notebook as it ran on the page's standard movie: the text, the code, the numbers it printed and its plots.</p>
      <p><b>To run it yourself</b>, download the movie from step 2 of <a href="../../%(page)s/">the page</a> (the files are named in the first code cell), put it next to the notebook and run all cells; it needs <code>%(pkgs)s</code>. In Google Colab (a Google account is needed; the movie goes to Google's servers), add a first cell with <code>!pip install %(pkgs)s</code>, upload the movie with the folder icon on the left, then choose Runtime, Run all.</p>
    </div>
  </section>
  <section class="wrap nb">
%(body)s
  </section>
</main>

<footer class="site"><div class="wrap">Roberto Cerbino, University of Vienna. The notebook runs on your computer, or in Google Colab if you open it there.</div></footer>
""" % {"page": page, "page_title": page_title, "h1": html.escape(h1), "ipynb": ipynb, "colab": colab, "pkgs": html.escape(pkgs), "body": "\n".join(body)}
    out = ascii(out)
    dst = HERE / "notebooks" / (name + ".src.html")
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(out)
    print("written", dst.relative_to(HERE.parent), len(out), "bytes")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    for name in NOTEBOOKS:
        render(name, folder / ("exec-ddm-%s.ipynb" % name))
