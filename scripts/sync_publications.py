#!/usr/bin/env python3
"""Rebuild data/publications.json from ORCID (the list of works) and
Crossref (full citation details for each DOI).

Manual information that ORCID and Crossref cannot know - which papers are
reviews, covers, selected highlights, entries to hide, entries without a
DOI - lives in data/publications_overrides.yaml and is merged in here.

Run:  python3 scripts/sync_publications.py
Exit code 0 also when nothing changed. The script never deletes an entry
that is listed in the overrides file.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

ORCID = "0000-0003-0434-7741"
CONTACT = "roberto.cerbino@univie.ac.at"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "publications.json"
OVERRIDES = ROOT / "data" / "publications_overrides.yaml"
CACHE = ROOT / "data" / ".crossref_cache.json"

# ORCID work types mapped to the categories shown on the site
TYPE_MAP = {
    "journal-article": "article",
    "book": "book",
    "edited-book": "book",
    "book-chapter": "chapter",
    "conference-paper": "proceedings",
    "preprint": "preprint",
    "working-paper": "preprint",
    "website": "other",
    "conference-presentation": "other",
    "book-review": "other",
    "other": "other",
}
CROSSREF_TYPE_MAP = {
    "journal-article": "article",
    "proceedings-article": "proceedings",
    "book-chapter": "chapter",
    "book": "book",
    "edited-book": "book",
    "posted-content": "preprint",
}
SKIP_TYPES = {"lecture-speech", "conference-poster"}


def get_json(url, accept="application/json", tries=3):
    headers = {"Accept": accept,
               "User-Agent": f"cerbino-website/1.0 (mailto:{CONTACT})"}
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == tries - 1:
                print(f"  failed: {url} ({exc})", file=sys.stderr)
                return None
            time.sleep(3 * (attempt + 1))
        except Exception as exc:  # network hiccup: wait and retry
            if attempt == tries - 1:
                print(f"  failed: {url} ({exc})", file=sys.stderr)
                return None
            time.sleep(3 * (attempt + 1))


def norm_doi(doi):
    if not doi:
        return None
    doi = doi.strip().lower()
    doi = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", doi)
    return doi or None


def clean(text):
    if not text:
        return ""
    import html
    text = re.sub(r"<[^>]+>", "", text)          # Crossref titles carry markup
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def initials(given):
    parts = re.split(r"[\s]+", given.strip())
    out = []
    for p in parts:
        sub = [s for s in p.split("-") if s]
        out.append("-".join(s[0] + "." for s in sub))
    return " ".join(out)


def is_me(family, given):
    return family.lower() == "cerbino" and given[:1].lower() == "r"


def crossref(doi, cache):
    if doi in cache:
        return cache[doi]
    data = get_json("https://api.crossref.org/works/" + urllib.parse.quote(doi))
    time.sleep(0.2)
    msg = data["message"] if data and "message" in data else None
    if msg:
        keep = {k: msg.get(k) for k in (
            "title", "author", "editor", "container-title", "short-container-title",
            "volume", "issue", "page", "article-number", "issued", "published-print",
            "published-online", "type", "is-referenced-by-count", "publisher", "relation",
            "subtype")}
        cache[doi] = keep
    return msg and cache[doi]


def same_title(a, b):
    from difflib import SequenceMatcher
    na, nb = (re.sub(r"\W+", " ", clean(x).lower()).strip() for x in (a, b))
    return SequenceMatcher(None, na, nb).ratio() > 0.9


def find_journal_version(title, cache):
    """Look up the journal version of a work on Crossref by its title.
    Used when ORCID only holds an arXiv/bioRxiv identifier or no DOI."""
    key = "search:" + title.lower()
    if key in cache:
        return cache[key]
    q = urllib.parse.urlencode({"query.bibliographic": title, "query.author": "Cerbino",
                                "rows": 5, "filter": "type:journal-article,type:proceedings-article,type:book-chapter"})
    data = get_json("https://api.crossref.org/works?" + q)
    time.sleep(0.2)
    found = None
    for item in ((data or {}).get("message") or {}).get("items", []):
        fams = [(a.get("family") or "").lower() for a in item.get("author") or []]
        if "cerbino" in fams and same_title(title, (item.get("title") or [""])[0]):
            found = norm_doi(item["DOI"])
            break
    cache[key] = found
    return found


def year_of(cr, fallback):
    for key in ("published-print", "issued", "published-online"):
        parts = ((cr or {}).get(key) or {}).get("date-parts") or [[None]]
        if parts and parts[0] and parts[0][0]:
            return int(parts[0][0])
    return int(fallback) if fallback else None


def build_entry(summary, doi, cr):
    title = clean((cr or {}).get("title", [None])[0] if cr and cr.get("title") else None) \
        or clean(summary["title"]["title"]["value"])
    orcid_year = ((summary.get("publication-date") or {}).get("year") or {}).get("value")
    authors = []
    for a in (cr or {}).get("author") or []:
        fam = clean(a.get("family") or a.get("name") or "")
        giv = clean(a.get("given") or "")
        if not fam:
            continue
        authors.append({"name": (initials(giv) + " " + fam).strip() if giv else fam,
                        "me": is_me(fam, giv)})
    journal = clean(((cr or {}).get("container-title") or [None])[0]) \
        or clean((summary.get("journal-title") or {}).get("value"))
    kind = TYPE_MAP.get(summary["type"], "article")
    if cr and summary["type"] in ("other", "journal-article", "conference-paper"):
        kind = CROSSREF_TYPE_MAP.get(cr.get("type"), kind)
    url = f"https://doi.org/{doi}" if doi else ""
    arxiv = None
    for ext in summary.get("external-ids", {}).get("external-id", []) or []:
        if ext["external-id-type"] == "arxiv":
            m = re.search(r"(\d{4}\.\d{4,5}|[a-z\-]+/\d{7})", ext["external-id-value"])
            arxiv = m.group(1) if m else ext["external-id-value"]
    if not url and arxiv:
        url = f"https://arxiv.org/abs/{arxiv}"
        journal = journal or f"arXiv:{arxiv}"
    if not url:
        url = (summary.get("url") or {}).get("value") or ""
    return {
        "doi": doi,
        "title": title,
        "authors": authors,
        "journal": journal,
        "volume": (cr or {}).get("volume") or "",
        "pages": (cr or {}).get("page") or (cr or {}).get("article-number") or "",
        "year": year_of(cr, orcid_year),
        "type": kind,
        "citations": (cr or {}).get("is-referenced-by-count"),
        "url": url,
        "tags": [],
        "source": "orcid",
    }


def main():
    overrides = yaml.safe_load(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    overrides = overrides or {}
    tags = {norm_doi(k): v for k, v in (overrides.get("tags") or {}).items()}
    hidden = {norm_doi(d) if str(d).startswith("10.") else str(d).lower()
              for d in overrides.get("hide") or []}
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    works = get_json(f"https://pub.orcid.org/v3.0/{ORCID}/works")
    if not works:
        print("ORCID unreachable - keeping the current publication list.")
        return 0

    entries, seen = [], set()
    for group in works["group"]:
        summary = group["work-summary"][0]
        if summary["type"] in SKIP_TYPES:
            continue
        doi = None
        for ext in group["external-ids"]["external-id"]:
            if ext["external-id-type"] == "doi":
                doi = norm_doi(ext["external-id-value"])
        if doi and (doi in seen or doi in hidden):
            continue
        title = clean(summary["title"]["title"]["value"])
        if any(title.lower().startswith(h) for h in hidden if h and not h.startswith("10.")):
            continue
        cr = crossref(doi, cache) if doi else None
        # ORCID sometimes holds only the arXiv/bioRxiv copy, or no DOI at all:
        # look for the journal version and use that instead
        is_copy = doi and (doi.startswith("10.48550/") or doi.startswith("10.1101/"))
        if (not cr or is_copy) and summary["type"] != "book":
            alt = find_journal_version(title, cache)
            if alt and alt != doi and alt not in seen and alt not in hidden:
                alt_cr = crossref(alt, cache)
                if alt_cr:
                    doi, cr = alt, alt_cr
                    summary = dict(summary, type="journal-article")
        entry = build_entry(summary, doi, cr)
        if not doi:
            key = entry["title"].lower()
            if key in seen:
                continue
            seen.add(key)
        else:
            seen.add(doi)
        if not entry["authors"]:
            entry["authors"] = [{"name": "R. Cerbino", "me": True}]
        entries.append(entry)

    # manual entries (books and items without DOI that ORCID does not hold)
    for extra in overrides.get("extra") or []:
        if isinstance(extra, str):          # a bare DOI: Crossref fills in everything
            extra = {"doi": extra}
        key = norm_doi(extra.get("doi")) or extra["title"].lower()
        if key in seen:
            continue
        if extra.get("doi") and not extra.get("title"):
            cr = crossref(norm_doi(extra["doi"]), cache)
            if not cr:
                continue
            fake = {"title": {"title": {"value": ""}}, "type": "journal-article",
                    "publication-date": None}
            e = build_entry(fake, norm_doi(extra["doi"]), cr)
            e["source"] = "manual"
            entries.append(e)
            seen.add(key)
            continue
        e = {"doi": norm_doi(extra.get("doi")), "title": extra["title"],
             "authors": [{"name": n.strip(), "me": "Cerbino" in n}
                         for n in extra.get("authors", "R. Cerbino").split(",")],
             "journal": extra.get("journal", ""), "volume": extra.get("volume", ""),
             "pages": extra.get("pages", ""), "year": extra.get("year"),
             "type": extra.get("type", "article"), "citations": None,
             "url": extra.get("url") or (f"https://doi.org/{extra['doi']}" if extra.get("doi") else ""),
             "tags": [], "source": "manual", "note": extra.get("note", "")}
        entries.append(e)
        seen.add(key)

    # manual corrections for entries ORCID/Crossref describe poorly,
    # keyed by DOI or by the start of the title (lower case)
    patches = overrides.get("patch") or {}
    for e in entries:
        for key, fields in patches.items():
            k = str(key).lower()
            if (e["doi"] and norm_doi(k) == e["doi"]) or e["title"].lower().startswith(k):
                for f, v in fields.items():
                    if f == "authors":
                        e["authors"] = [{"name": n.strip(), "me": "Cerbino" in n}
                                        for n in v.split(",")]
                    else:
                        e[f] = v

    # apply manual tags (review, cover, selected, editors-suggestion, ...)
    for e in entries:
        t = tags.get(e["doi"]) if e["doi"] else None
        if t:
            e["tags"] = sorted(set(t))
            if "review" in t and e["type"] == "article":
                e["type"] = "review"
            if "preprint" in t:
                e["type"] = "preprint"

    # a preprint that has since been published shows only once
    titles = {}
    for e in entries:
        titles.setdefault(re.sub(r"\W+", "", e["title"].lower())[:80], []).append(e)
    final = []
    for e in entries:
        same = titles[re.sub(r"\W+", "", e["title"].lower())[:80]]
        if e["type"] == "preprint" and any(o is not e and o["type"] != "preprint" for o in same):
            continue
        final.append(e)

    final.sort(key=lambda e: (-(e["year"] or 0), e["title"].lower()))
    CACHE.write_text(json.dumps(cache, indent=0, ensure_ascii=False))
    new_text = json.dumps(final, indent=1, ensure_ascii=False)
    old_text = OUT.read_text() if OUT.exists() else ""
    if new_text != old_text:
        OUT.write_text(new_text)
        print(f"publications.json updated: {len(final)} entries")
    else:
        print(f"no change ({len(final)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
