#!/usr/bin/env python3
"""Per-paper metrics for the publication list -> data/metrics.json

- citations: the higher of Crossref (already in publications.json) and
  Semantic Scholar. If data/scholar_citations.json exists (Google Scholar
  counts per paper, written by another task), those win, because Google
  Scholar is the figure quoted elsewhere on the site.
- free full text: open-access PDF found by Semantic Scholar
- field-normalised impact (optional): OpenAlex FWCI and top-1% / top-10%
  flags, only when the environment variable OPENALEX_API_KEY is set
Attention (news, policy, social media) is shown live in the browser by the
Altmetric badge and needs nothing stored here.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBS = ROOT / "data" / "publications.json"
SCHOLAR = ROOT / "data" / "scholar_citations.json"
OUT = ROOT / "data" / "metrics.json"
CONTACT = "roberto.cerbino@univie.ac.at"
UA = {"User-Agent": f"cerbino-website/1.0 (mailto:{CONTACT})"}


def post_json(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={**UA, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as exc:
            if attempt == 3:
                print(f"  failed: {url[:80]} ({exc})", file=sys.stderr)
                return None
            time.sleep(5 * (attempt + 1))


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as exc:
        print(f"  failed: {url[:80]} ({exc})", file=sys.stderr)
        return None


def semantic_scholar(dois):
    out = {}
    fields = "citationCount,influentialCitationCount,openAccessPdf,url"
    for i in range(0, len(dois), 400):
        chunk = dois[i:i + 400]
        res = post_json(f"https://api.semanticscholar.org/graph/v1/paper/batch?fields={fields}",
                        {"ids": ["DOI:" + d for d in chunk]})
        if res is None:
            return None
        for d, x in zip(chunk, res):
            if x:
                out[d] = x
        time.sleep(1.5)
    return out


def openalex(dois, key):
    out = {}
    for i in range(0, len(dois), 50):
        chunk = dois[i:i + 50]
        q = urllib.parse.urlencode({
            "filter": "doi:" + "|".join(chunk), "per-page": 50, "api_key": key,
            "select": "doi,fwci,citation_normalized_percentile,cited_by_count"})
        data = get_json("https://api.openalex.org/works?" + q)
        for w in (data or {}).get("results", []):
            out[w["doi"].replace("https://doi.org/", "").lower()] = w
        time.sleep(0.3)
    return out


def free_pdf(oa):
    if not oa or not oa.get("url"):
        return None
    url = oa["url"]
    if "doi.org/" in url or url.endswith("_reference.pdf"):
        return None
    if (oa.get("status") or "").upper() not in ("GOLD", "GREEN", "HYBRID", "BRONZE", "DIAMOND"):
        return None
    return url


def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def main():
    pubs = json.loads(PUBS.read_text())
    dois = [p["doi"] for p in pubs if p.get("doi")]
    old = json.loads(OUT.read_text()) if OUT.exists() else {"papers": {}}

    s2 = semantic_scholar(dois)
    if s2 is None:
        print("Semantic Scholar unreachable - keeping current metrics")
        s2 = {}
    key = os.environ.get("OPENALEX_API_KEY")
    oa = openalex(dois, key) if key else {}

    scholar = {}
    if SCHOLAR.exists():
        sc = json.loads(SCHOLAR.read_text())
        # [{"title":..., "year":..., "citations":...}] matched to papers by title
        for p in pubs:
            t = norm(p["title"])
            best, br = None, 0
            for row in sc.get("papers", []):
                r = SequenceMatcher(None, t, norm(row["title"])).ratio()
                if r > br:
                    best, br = row, r
            if best and br >= 0.9:
                scholar[p.get("doi") or p["title"]] = best["citations"]

    papers = {}
    for p in pubs:
        key_ = p.get("doi") or p["title"]
        prev = old.get("papers", {}).get(key_, {})
        x = s2.get(p.get("doi")) if p.get("doi") else None
        rec = {}
        cr = p.get("citations")
        s2c = x.get("citationCount") if x else prev.get("semantic_scholar")
        if key_ in scholar:
            rec["citations"], rec["citation_source"] = scholar[key_], "Google Scholar"
        else:
            best = max([c for c in (cr, s2c) if c is not None], default=None)
            if best is not None:
                rec["citations"] = best
                rec["citation_source"] = "Semantic Scholar" if (s2c or 0) > (cr or 0) else "Crossref"
        if s2c is not None:
            rec["semantic_scholar"] = s2c
        if x:
            rec["influential"] = x.get("influentialCitationCount")
            rec["s2_url"] = x.get("url")
            pdf = free_pdf(x.get("openAccessPdf"))
            if pdf:
                rec["free_pdf"] = pdf
        elif prev.get("free_pdf"):
            rec["free_pdf"] = prev["free_pdf"]
        w = oa.get(p.get("doi") or "")
        if w:
            pct = w.get("citation_normalized_percentile") or {}
            rec["fwci"] = round(w["fwci"], 2) if w.get("fwci") is not None else None
            rec["top1"] = bool(pct.get("is_in_top_1_percent"))
            rec["top10"] = bool(pct.get("is_in_top_10_percent"))
        else:
            for k in ("fwci", "top1", "top10"):
                if k in prev:
                    rec[k] = prev[k]
        papers[key_] = rec

    total = sum(r.get("citations") or 0 for r in papers.values())
    result = {"updated": time.strftime("%Y-%m-%d"), "total_citations": total, "papers": papers}
    # do not rewrite the file only because the date changed
    if old.get("papers") != papers or old.get("total_citations") != total:
        OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False))
        print(f"metrics.json updated ({len(papers)} papers, {total} citations)")
    else:
        print("metrics unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
