#!/usr/bin/env python3
"""Fetch the latest posts from the SoMeX group website (its RSS feed) into
data/group_news.json, so the personal site shows group news without anyone
copying it by hand. Keeps the previous file if the feed cannot be reached."""
import html
import json
import re
import sys
import urllib.request
from email.utils import parsedate_to_datetime
from pathlib import Path

FEED = "https://somexlab.github.io/post/index.xml"
OUT = Path(__file__).resolve().parent.parent / "data" / "group_news.json"
KEEP = 12

# Emoji and other pictographs are dropped so titles read cleanly
PICTO = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def text(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", html.unescape(s or "")))
    s = PICTO.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def main():
    try:
        req = urllib.request.Request(FEED, headers={"User-Agent": "cerbino-website/1.0"})
        raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    except Exception as exc:
        print(f"feed unreachable ({exc}); keeping current group news")
        return 0
    items = []
    for it in re.findall(r"<item>(.*?)</item>", raw, re.S):
        get = lambda tag: (re.search(rf"<{tag}>(.*?)</{tag}>", it, re.S) or [None, ""])[1]
        title = text(get("title"))
        if title.lower().startswith("(closed)"):
            continue
        summary = text(get("description"))
        if len(summary) > 220:
            summary = summary[:220].rsplit(" ", 1)[0] + "..."
        items.append({
            "title": title,
            "date": parsedate_to_datetime(get("pubDate")).strftime("%Y-%m-%d"),
            "url": get("link").strip(),
            "summary": summary,
        })
    items.sort(key=lambda x: x["date"], reverse=True)
    new = json.dumps(items[:KEEP], indent=1, ensure_ascii=False)
    old = OUT.read_text() if OUT.exists() else ""
    if new != old:
        OUT.write_text(new)
        print(f"group_news.json updated ({len(items[:KEEP])} items)")
    else:
        print("group news unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
