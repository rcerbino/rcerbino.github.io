#!/usr/bin/env python3
"""Find Roberto's preprints (arXiv, bioRxiv, medRxiv, Research Square, SSRN,
ChemRxiv, ...) and attach each one to its published journal version.

Sources: the arXiv API, Crossref (posted content) and Europe PMC (preprints).
Matching, in order of reliability:
  1. a link stated by the source (arXiv "doi" field, Crossref "is-preprint-of",
     Europe PMC link to the published record)
  2. a manual decision in data/publications_overrides.yaml (preprint_of /
     standalone_preprints)
  3. a close title match with a paper in data/publications.json
  4. same first author, published in the same year or later, and strongly
     overlapping title words
Preprints with no published version are written as "standalone" (shown under
Preprints on the site) when they are recent; older unmatched ones go to
"unmatched" for a person (or the monthly Claude task) to decide.

Output: data/preprints.json
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PUBS = ROOT / "data" / "publications.json"
OVERRIDES = ROOT / "data" / "publications_overrides.yaml"
OUT = ROOT / "data" / "preprints.json"
CONTACT = "roberto.cerbino@univie.ac.at"
RECENT_YEARS = 3          # unmatched preprints younger than this are shown

STOP = set("a an the of in and for with by on to from at as is are its their via under".split())


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={
        "Accept": accept, "User-Agent": f"cerbino-website/1.0 (mailto:{CONTACT})"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception as exc:
            if attempt == 2:
                print(f"  failed: {url[:90]} ({exc})", file=sys.stderr)
                return None
            time.sleep(4 * (attempt + 1))


def norm(t):
    t = re.sub(r"<[^>]+>|\$[^$]*\$", " ", t or "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t.lower())).strip()


def words(t):
    return {w for w in norm(t).split() if w not in STOP and len(w) > 2}


def norm_doi(d):
    if not d:
        return None
    d = d.strip().lower().rstrip(".")
    return re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", d)


def is_me(name):
    """'R. Cerbino', 'Roberto Cerbino', 'Cerbino, R.' -> True"""
    n = name.replace(",", " ").split()
    if "Cerbino" not in n:
        return False
    rest = [x for x in n if x != "Cerbino"]
    return any(x[:1].upper() == "R" for x in rest)


# ---------------------------------------------------------------- sources
def from_arxiv():
    raw = get("https://export.arxiv.org/api/query?search_query=au:Cerbino&max_results=400",
              accept="application/atom+xml")
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", raw or "", re.S):
        authors = re.findall(r"<name>(.*?)</name>", e)
        if not any(is_me(a) for a in authors):
            continue
        aid = re.search(r"<id>https?://arxiv.org/abs/(.*?)</id>", e).group(1)
        aid = re.sub(r"v\d+$", "", aid)
        out.append({
            "server": "arXiv",
            "id": aid,
            "url": f"https://arxiv.org/abs/{aid}",
            "title": re.sub(r"\s+", " ", re.search(r"<title>(.*?)</title>", e, re.S).group(1)).strip(),
            "authors": authors,
            "year": int(re.search(r"<published>(\d{4})", e).group(1)),
            "linked_doi": norm_doi((re.search(r"<arxiv:doi[^>]*>(.*?)</arxiv:doi>", e) or [None, None])[1]),
        })
    return out


def from_crossref():
    out = []
    q = urllib.parse.urlencode({"query.author": "Roberto Cerbino", "filter": "type:posted-content",
                                "rows": 200, "mailto": CONTACT})
    raw = get("https://api.crossref.org/works?" + q)
    for it in (json.loads(raw)["message"]["items"] if raw else []):
        authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in it.get("author", [])]
        if not any(is_me(a) for a in authors):
            continue
        server = ((it.get("institution") or [{}])[0].get("name") or it.get("publisher") or "Preprint")
        doi = norm_doi(it["DOI"])
        if doi.startswith("10.2139/ssrn"):
            server = "SSRN"
        rel = (it.get("relation") or {}).get("is-preprint-of") or []
        parts = (it.get("posted") or it.get("issued") or {}).get("date-parts", [[None]])[0]
        out.append({
            "server": server,
            "id": doi,
            "url": f"https://doi.org/{doi}",
            "title": re.sub(r"<[^>]+>|\s+", " ", (it.get("title") or [""])[0]).strip(),
            "authors": authors,
            "year": parts[0],
            "linked_doi": norm_doi(rel[0]["id"]) if rel else None,
        })
    return out


def from_europepmc():
    out = []
    q = urllib.parse.quote('AUTH:"Cerbino R" AND SRC:PPR')
    raw = get(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={q}"
              "&format=json&pageSize=200&resultType=core")
    for r in (json.loads(raw)["resultList"]["result"] if raw else []):
        doi = norm_doi(r.get("doi"))
        if not doi:
            continue
        pmids = [c.get("id") for c in (r.get("commentCorrectionList") or {}).get("commentCorrection", [])
                 if c.get("source") == "MED"]
        out.append({
            "server": (r.get("bookOrReportDetails") or {}).get("publisher") or "Preprint",
            "id": doi,
            "url": f"https://doi.org/{doi}",
            "title": re.sub(r"<[^>]+>|\s+", " ", r.get("title", "")).strip().rstrip("."),
            "authors": [a.strip() for a in (r.get("authorString") or "").split(",")],
            "year": int(r.get("pubYear") or 0) or None,
            "linked_doi": None,
            "linked_pmid": pmids[0] if pmids else None,
        })
    return out


def pmid_to_doi(pmid):
    raw = get(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:{pmid}%20AND%20SRC:MED&format=json")
    try:
        return norm_doi(json.loads(raw)["resultList"]["result"][0].get("doi"))
    except Exception:
        return None


# ---------------------------------------------------------------- matching
def first_author_surname(authors):
    if not authors:
        return ""
    a = authors[0]
    if isinstance(a, dict):
        a = a["name"]
    a = a.replace(",", " ").split()
    # "Barzaghi, L." / "L. Barzaghi" / "Luca Barzaghi": take the longest token
    return max(a, key=len).lower() if a else ""


def match(pp, pubs):
    """Return (doi, how) of the published version, or (None, None)."""
    t = norm(pp["title"])
    best, best_r = None, 0
    for p in pubs:
        if p["type"] == "preprint" or not p.get("doi"):
            continue
        r = SequenceMatcher(None, t, norm(p["title"])).ratio()
        if r > best_r:
            best, best_r = p, r
    if best and best_r >= 0.82:
        return best["doi"], f"title {best_r:.2f}"
    fa = first_author_surname(pp["authors"])
    w = words(pp["title"])
    for p in pubs:
        if p["type"] == "preprint" or not p.get("doi") or not p.get("year"):
            continue
        if pp.get("year") and p["year"] < pp["year"]:
            continue
        if first_author_surname(p["authors"]) != fa:
            continue
        pw = words(p["title"])
        overlap = len(w & pw) / max(1, min(len(w), len(pw)))
        if overlap >= 0.5:
            return p["doi"], f"first author + {overlap:.2f} word overlap"
    return None, None


def main():
    pubs = json.loads(PUBS.read_text())
    by_doi = {p["doi"]: p for p in pubs if p.get("doi")}
    ov = yaml.safe_load(OVERRIDES.read_text()) or {}
    manual_of = {str(k).lower(): norm_doi(v) for k, v in (ov.get("preprint_of") or {}).items()}
    manual_standalone = {str(x).lower() for x in ov.get("standalone_preprints") or []}
    manual_ignore = {str(x).lower() for x in ov.get("ignore_preprints") or []}

    found = from_arxiv() + from_crossref() + from_europepmc()
    if not found:
        print("no preprint source reachable - keeping current file")
        return 0

    # merge the same preprint seen by several sources
    seen, items = {}, []
    for pp in found:
        key = pp["id"].lower()
        if key in seen:
            old = seen[key]
            old["linked_doi"] = old.get("linked_doi") or pp.get("linked_doi")
            old["linked_pmid"] = old.get("linked_pmid") or pp.get("linked_pmid")
            continue
        seen[key] = pp
        items.append(pp)

    this_year = time.gmtime().tm_year
    links, standalone, unmatched = {}, [], []
    for pp in items:
        key = pp["id"].lower()
        if key in manual_ignore:
            continue
        doi, how = None, None
        if key in manual_of:
            doi, how = manual_of[key], "manual"
        elif key in manual_standalone:
            doi, how = None, "manual"
        elif pp.get("linked_doi") and pp["linked_doi"] in by_doi:
            doi, how = pp["linked_doi"], "stated by " + pp["server"]
        elif pp.get("linked_pmid"):
            d = pmid_to_doi(pp["linked_pmid"])
            if d in by_doi:
                doi, how = d, "Europe PMC link"
        if not doi and how != "manual":
            doi, how = match(pp, pubs)
        record = {k: pp[k] for k in ("server", "id", "url", "title", "year")}
        if doi:
            record["how"] = how
            links.setdefault(doi, []).append(record)
        elif how == "manual" or (pp.get("year") and this_year - pp["year"] < RECENT_YEARS
                                 and not pp.get("linked_doi")):
            record["authors"] = pp["authors"]
            standalone.append(record)
        else:
            record["authors"] = pp["authors"][:6]
            record["linked_doi"] = pp.get("linked_doi")
            unmatched.append(record)

    for v in links.values():
        v.sort(key=lambda r: r["server"])
    standalone.sort(key=lambda r: -(r["year"] or 0))
    result = {"links": dict(sorted(links.items())), "standalone": standalone, "unmatched": unmatched}
    new = json.dumps(result, indent=1, ensure_ascii=False)
    if not OUT.exists() or OUT.read_text() != new:
        OUT.write_text(new)
        print(f"preprints.json updated: {sum(len(v) for v in links.values())} linked to "
              f"{len(links)} papers, {len(standalone)} unpublished, {len(unmatched)} to review")
    else:
        print("preprints unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
