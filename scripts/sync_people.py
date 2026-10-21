#!/usr/bin/env python3
"""Read the people page of the SoMeX group website and write
data/people.json: everyone Roberto supervises or hosts in Vienna, grouped by
role, with current/former status, home institution and period.

The SoMeX site is the single place where team members are listed. Corrections
and additions (for example a co-supervision) go in content/teaching.yaml under
mentoring > overrides / exclude / extra.
"""
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import yaml

BASE = "https://somexlab.github.io"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "people.json"
CONF = ROOT / "content" / "teaching.yaml"
MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cerbino-website/1.0"})
    for attempt in range(3):
        try:
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
        except Exception as exc:
            if attempt == 2:
                print(f"  failed: {url} ({exc})", file=sys.stderr)
                return None
            time.sleep(3)


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def period(role):
    """"PhD Student (Sep'26-Feb'27)" -> "Sep 2026 - Feb 2027"; "(Aug'26)" -> "Aug 2026"."""
    m = re.search(r"\(([^)]*)\)", role)
    if not m:
        return ""
    raw = m.group(1).replace("’", "'")
    parts = [p.strip() for p in raw.split("-")]
    years = re.findall(r"'(\d\d)", raw)
    out = []
    for p in parts:
        mm = re.match(r"([A-Za-z]{3})(?:'(\d\d))?", p)
        if not mm:
            continue
        y = mm.group(2) or (years[-1] if years else "")
        out.append(f"{mm.group(1)} 20{y}" if y else mm.group(1))
    return " - ".join(out)


def affiliation(slug):
    page = get(f"{BASE}/author/{slug}/")
    if not page:
        return "", ""
    body = re.sub(r"<script.*?</script>|<style.*?</style>|<nav.*?</nav>", "", page, flags=re.S)
    lines = [l for l in (text(x) for x in re.split(r"<[^>]+>", body)) if l]
    # page layout: name, role, organisation, biography...
    try:
        i = lines.index(next(l for l in lines if l.lower().replace("-", " ") == slug.replace("-", " ")
                             or l.lower() == slug.replace("-", " ")))
    except StopIteration:
        i = 1
    org = lines[i + 2] if len(lines) > i + 2 else ""
    if len(org) > 80 or org.startswith(("I ", "Education", "Cite")):
        org = ""
    org = re.sub(r"\s*\(\S*\s*\d{4}\)\s*$", "", org)          # "(graduation-cap 2025)"
    grad = re.search(r"(\d{4})\)\s*$", lines[i + 2] if len(lines) > i + 2 else "")
    return org, grad.group(1) if grad else ""


def classify(section, role):
    r = role.lower()
    s = section.lower()
    past = s.startswith(("alumni", "past"))
    if "postdoc" in r:
        group = "postdocs"
    elif "intern" in r:
        group = "interns"
    elif s.endswith("visitors"):
        group = "visitors"
    elif "phd" in r:
        group = "phd"
    elif "msc" in r:
        group = "msc"
    elif "bsc" in r:
        group = "bsc"
    else:
        group = None
    return group, not past


def main():
    conf = (yaml.safe_load(CONF.read_text()) or {}).get("mentoring", {})
    exclude = set(conf.get("exclude") or [])
    overrides = conf.get("overrides") or {}

    page = get(f"{BASE}/people/")
    if not page:
        print("SoMeX people page unreachable - keeping current list")
        return 0
    body = re.sub(r"<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<footer.*?</footer>", "", page, flags=re.S)

    # sections are <h2 class=mb-4>Title</h2>; each person is
    # <h2><a href=/author/slug/>Name</a></h2><h3>Role</h3>
    people, section = [], ""
    pattern = (r'<h2 class="?mb-4"?>(.*?)</h2>'
               r'|<h2><a href="?/author/([a-z0-9-]+)/"?>(.*?)</a></h2>\s*<h3>(.*?)</h3>')
    for m in re.finditer(pattern, body, re.S):
        if m.group(1) is not None:
            section = text(m.group(1))
        else:
            people.append({"slug": m.group(2), "name": text(m.group(3)),
                           "role": text(m.group(4)), "section": section})

    result = []
    for p in people:
        slug = p["slug"]
        if slug in exclude:
            continue
        role = p.get("role", "")
        group, current = classify(p["section"], role)
        if not group:
            continue
        org, grad = affiliation(slug)
        if org.lower() == re.sub(r"\s*\(.*\)", "", role).strip().lower():
            org = ""                                  # page had no institution line
        rec = {
            "slug": slug,
            "name": p["name"],
            "group": group,
            "current": current,
            "role": re.sub(r"\s*\(.*\)", "", role).strip(),
            "period": period(role),
            "institution": org,
            "graduated": grad,
            "url": f"{BASE}/author/{slug}/",
        }
        rec.update(overrides.get(slug) or {})
        result.append(rec)
        time.sleep(0.2)

    for extra in conf.get("extra") or []:
        result.append(dict({"current": False, "url": "", "institution": "", "period": "", "role": ""}, **extra))

    new = json.dumps(result, indent=1, ensure_ascii=False)
    if not OUT.exists() or OUT.read_text() != new:
        OUT.write_text(new)
        print(f"people.json updated ({len(result)} people)")
    else:
        print("people unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
