#!/usr/bin/env python3
"""Build the website into _site/ from content/*.yaml, data/*.json and templates/.

    python3 build.py            # build
    python3 build.py --check    # build and fail on missing references

Nothing here needs editing for routine updates: change the YAML files in
content/ (or let the sync scripts refresh data/) and rebuild.
"""
import datetime as dt
import json
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"
SITE_URL = "https://cerbino.eu"
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()

PAGES = [
    # (output path, template, nav label)
    ("index.html", "home.html", "Home"),
    ("about/index.html", "about.html", "About"),
    ("research/index.html", "research.html", "Research"),
    ("publications/index.html", "publications.html", "Publications"),
    ("teaching/index.html", "teaching.html", "Teaching"),
    ("news/index.html", "news.html", "News"),
    ("contact/index.html", "contact.html", "Contact"),
]

TYPE_LABELS = {
    "preprint": "Preprints",
    "article": "Journal articles",
    "review": "Reviews, perspectives and tutorials",
    "chapter": "Book chapters",
    "book": "Books",
    "proceedings": "Conference proceedings",
    "other": "Other writing",
}
TYPE_ORDER = list(TYPE_LABELS)
TYPE_SHORT = {
    "preprint": "Preprint",
    "article": "Article",
    "review": "Review",
    "chapter": "Book chapter",
    "book": "Book",
    "proceedings": "Proceedings",
    "other": "Other",
}
TAG_LABELS = {"cover": "Cover", "editors-suggestion": "Editors' Suggestion"}


def load_yaml(name):
    return yaml.safe_load((ROOT / "content" / name).read_text(encoding="utf-8")) or {}


def load_json(name, default):
    p = ROOT / "data" / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def fmt_date(value):
    """'2026-04' -> 'Apr 2026', '2026-04-05' -> '5 Apr 2026', 2025 -> '2025'."""
    s = str(value)
    parts = s.split("-")
    if len(parts) == 1:
        return s
    y, m = parts[0], MONTHS[int(parts[1]) - 1]
    return f"{int(parts[2])} {m} {y}" if len(parts) == 3 else f"{m} {y}"


def authors_html(authors, limit=14):
    """Author list with Roberto's name marked; very long lists are shortened
    around his position."""
    names = [(a["name"], a.get("me")) for a in authors]
    if len(names) > limit:
        me = next((i for i, (_, m) in enumerate(names) if m), None)
        keep = set(range(6)) | {len(names) - 1}
        if me is not None:
            keep |= {me}
        shown, last = [], -1
        for i in sorted(keep):
            if i != last + 1:
                shown.append(("...", False))
            shown.append(names[i])
            last = i
        names = shown
    out = []
    for n, me in names:
        out.append(Markup('<span class="me">{}</span>').format(n) if me else escape(n))
    return Markup(", ").join(out)


def venue_text(p):
    bits = [p.get("journal") or ""]
    if p.get("volume"):
        bits.append(str(p["volume"]))
    if p.get("pages"):
        bits.append(str(p["pages"]))
    v = " ".join(b for b in bits[:1] if b)
    if len(bits) > 1:
        v += (" " if v else "") + ", ".join(bits[1:])
    return v


def short_name(name):
    """'Roberto Cerbino' or 'Cerbino R' or 'Cerbino, Roberto' -> 'R. Cerbino'"""
    name = name.strip()
    if "," in name:
        fam, giv = [x.strip() for x in name.split(",", 1)]
    else:
        parts = name.split()
        if len(parts) >= 2 and parts[-1].isupper() and len(parts[-1]) <= 3:
            fam, giv = " ".join(parts[:-1]), " ".join(parts[-1])       # 'Barzaghi L'
        else:
            fam, giv = parts[-1], " ".join(parts[:-1])
    inits = " ".join(g[0] + "." for g in giv.replace(".", " ").split() if g)
    return f"{inits} {fam}".strip()


def scholar_count(p, scholar):
    """Google Scholar citations for paper p, from data/scholar_citations.json
    (written monthly by the Scholar snapshot task), matched by title."""
    rows = scholar.get("papers") or []
    if not rows:
        return None
    if "_index" not in scholar:
        scholar["_index"] = [("".join(c for c in r["title"].lower() if c.isalnum()), r) for r in rows]
    t = "".join(c for c in p["title"].lower() if c.isalnum())
    from difflib import SequenceMatcher
    best, br = None, 0.0
    for key, r in scholar["_index"]:
        if key[:12] != t[:12] and abs(len(key) - len(t)) > 40:
            continue
        ratio = SequenceMatcher(None, t, key).ratio()
        if ratio > br:
            best, br = r, ratio
    if best and br >= 0.9 and (not p.get("year") or not best.get("year")
                               or abs(int(best["year"]) - int(p["year"])) <= 1):
        return int(best["citations"])
    return None


def merge_preprints(pubs, preprints):
    """Add unpublished preprints found by sync_preprints.py to the list, and
    drop preprint entries from ORCID that duplicate them."""
    norm = lambda t: "".join(c for c in t.lower() if c.isalnum())[:70]
    standalone = preprints.get("standalone", [])
    titles = [norm(s["title"]) for s in standalone]

    def duplicate(t):
        # ORCID sometimes keeps only the first part of a title
        t = norm(t)
        return any(len(min(t, u, key=len)) >= 15 and (t.startswith(u) or u.startswith(t))
                   for u in titles)

    out = [p for p in pubs if not (p["type"] == "preprint" and duplicate(p["title"]))]
    for s in standalone:
        authors = [{"name": short_name(a), "me": "Cerbino" in a} for a in s.get("authors", [])]
        out.append({"doi": None, "title": s["title"], "authors": authors,
                    "journal": f"{s['server']} preprint", "volume": "", "pages": "",
                    "year": s.get("year"), "type": "preprint", "citations": None,
                    "url": s["url"], "tags": [], "source": "preprint"})
    out.sort(key=lambda e: (-(e.get("year") or 0), e["title"].lower()))
    return out


def main(check=False, preview=False):
    profile = load_yaml("profile.yaml")
    about = load_yaml("about.yaml")
    research = load_yaml("research.yaml")
    teaching = load_yaml("teaching.yaml")
    news = load_yaml("news.yaml")
    pubs = load_json("publications.json", [])
    group_news = load_json("group_news.json", [])

    preprints = load_json("preprints.json", {"links": {}, "standalone": []})
    metrics = load_json("metrics.json", {"papers": {}})
    scholar = load_json("scholar_citations.json", {})
    pubs = merge_preprints(pubs, preprints)

    by_doi = {p["doi"]: p for p in pubs if p.get("doi")}
    problems = []

    def pub(doi):
        p = by_doi.get(str(doi).lower())
        if not p:
            problems.append(f"DOI not in publication list: {doi}")
        return p

    for p in pubs:
        p["authors_html"] = authors_html(p["authors"])
        p["venue"] = venue_text(p)
        p["badges"] = [TAG_LABELS[t] for t in p.get("tags", []) if t in TAG_LABELS]
        p["preprints"] = preprints["links"].get(p.get("doi"), []) if p.get("doi") else []
        m = dict(metrics["papers"].get(p.get("doi") or p["title"], {}))
        sc = scholar_count(p, scholar)
        if sc is not None:
            m["citations"], m["citation_source"] = sc, "Google Scholar"
        p["m"] = m
        if m.get("top1"):
            p["badges"].append("Top 1% cited")
        elif m.get("top10"):
            p["badges"].append("Top 10% cited")

    grouped = defaultdict(list)
    for p in pubs:
        grouped[p["type"]].append(p)
    pub_groups = [(t, TYPE_LABELS[t], grouped[t]) for t in TYPE_ORDER if grouped.get(t)]
    selected = [p for p in pubs if "selected" in p.get("tags", [])]
    years = sorted({p["year"] for p in pubs if p.get("year")}, reverse=True)
    peer = [p for p in pubs if p["type"] in ("article", "review")]

    today = dt.date.today()
    current_year = today.year

    def is_current(item, group):
        """A role counts as current if its year range includes this year, or
        if it has no years and is not marked past."""
        if item.get("past") or group.get("past"):
            return False
        years = str(item.get("years", "")).strip()
        if not years:
            return True
        start, _, end = years.partition("-")
        try:
            return int(start) <= current_year and (not end or int(end) >= current_year)
        except ValueError:
            return False

    current_roles = [it["what"] for g in about.get("service", []) for it in g["items"]
                     if is_current(it, g)]
    stats = {
        "metrics_updated": fmt_date(metrics["updated"]) if metrics.get("updated") else None,
        "scholar_as_of": fmt_date(scholar["updated"]) if scholar.get("updated") else None,
        "cited": sum(1 for p in pubs if p["m"].get("citations")),
        "with_preprint": sum(1 for p in pubs if p["preprints"]),
        "total": len(pubs),
        "peer": len(peer),
        "first_year": min(years) if years else None,
        "counts": Counter(p["type"] for p in pubs),
    }

    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=True,
                      trim_blocks=True, lstrip_blocks=True)
    env.filters["date"] = fmt_date
    import hashlib

    def asset(path):
        """Static file URL with a content hash, so browsers fetch the new
        version as soon as the file changes instead of using a cached copy."""
        f = ROOT / "static" / path
        h = hashlib.sha1(f.read_bytes()).hexdigest()[:8] if f.exists() else "0"
        return f"{path}?v={h}"

    env.globals.update(pub=pub, type_labels=TYPE_LABELS, type_short=TYPE_SHORT, asset=asset)

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ROOT / "static", OUT, dirs_exist_ok=True)

    def link(target):
        """Directory-style links on the live site; explicit index.html in
        preview builds, where the host does not resolve folders."""
        target = target.replace("index.html", "")
        if preview and (target == "" or target.endswith("/")):
            return target + "index.html"
        return target

    env.globals["link"] = link
    nav = [(link(path), label) for path, _, label in PAGES]
    ctx = dict(profile=profile, about=about, research=research, teaching=teaching,
               news=news, pubs=pubs, pub_groups=pub_groups, selected=selected,
               years=years, stats=stats, current_roles=current_roles, group_news=group_news, nav=nav,
               built=today.isoformat(), built_human=fmt_date(today.isoformat()),
               current_year=current_year, site_url=SITE_URL)

    for path, template, label in PAGES:
        depth = path.count("/")
        html = env.get_template(template).render(
            **ctx, page=label, root="../" * depth, path=path.replace("index.html", ""))
        target = OUT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")

    (OUT / "404.html").write_text(env.get_template("404.html").render(
        **ctx, page="Not found", root="/", path="404"), encoding="utf-8")
    (OUT / "CNAME").write_text("cerbino.eu\n")
    (OUT / ".nojekyll").write_text("")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
    urls = "".join(f"<url><loc>{SITE_URL}/{p.replace('index.html', '')}</loc>"
                   f"<lastmod>{today.isoformat()}</lastmod></url>" for p, _, _ in PAGES)
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')

    for msg in problems:
        print("WARNING:", msg)
    print(f"built {len(PAGES)} pages into {OUT} ({len(pubs)} publications)")
    return 1 if (check and problems) else 0


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv, preview="--preview" in sys.argv))
