# cerbino.eu

Personal website of Roberto Cerbino, published with GitHub Pages at https://rcerbino.github.io.
The domain cerbino.eu forwards there (permanent redirect set in the Aruba control panel).

## Editing

All text is in `content/`, one file per section, in YAML. Change a file on
GitHub (pencil icon), commit, and the site rebuilds in about a minute.

- `profile.yaml` - name, title, contact, research IDs
- `about.yaml` - biography, CV, service and roles
- `research.yaml` - research themes, lab, grants
- `teaching.yaml` - courses, teaching innovation, mentoring
- `news.yaml` - news and talks

Publications come from ORCID automatically. To mark a paper as selected, a
review or a cover, or to hide one, edit `data/publications_overrides.yaml`.

## What updates by itself

- Every Monday: publications (ORCID and Crossref), links to preprint versions
  (arXiv, bioRxiv, Research Square, ...), per-paper citations and free full
  texts (Crossref, Semantic Scholar), and SoMeX group news. Altmetric badges
  update live in the browser.
- Every month: a Claude scheduled task adds news about new papers and proposes,
  as a pull request, talks, grants and roles it finds in mail and calendar.
  See `CLAUDE.md`.

## Building locally

```
pip install pyyaml jinja2
python3 scripts/sync_publications.py   # optional: refresh publications
python3 build.py                       # writes the site to _site/
```
