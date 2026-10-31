# Instructions for Claude: maintaining cerbino.eu

This repository is Roberto Cerbino's personal website, served at
https://rcerbino.github.io. The domain cerbino.eu is registered at Aruba and
forwards there with a permanent (301) redirect set in the Aruba panel; DNS was
not changed, so do not add a CNAME file or a GitHub Pages custom domain. It is a small static site:
content lives in `content/*.yaml`, generated data in `data/`, templates in
`templates/`, and `build.py` turns them into `_site/`. GitHub Actions builds and
publishes on every push to `main`, and refreshes publications and group news
every Monday on its own.

## Monthly update (scheduled task)

Work through these steps in order. Keep the whole run short and factual.

### 1. Refresh public data (goes live directly)

```
pip install --break-system-packages pyyaml jinja2
python3 scripts/sync_publications.py
python3 scripts/sync_preprints.py
python3 scripts/sync_metrics.py
python3 scripts/sync_group_news.py
python3 scripts/sync_people.py
python3 build.py --check
```

- If `build.py --check` prints warnings, fix them (usually a DOI in
  `content/research.yaml` that is no longer in the list) before committing.
- For every new journal article or review that appeared in
  `data/publications.json` since the last run (compare with `git diff`), add a
  news item to `content/news.yaml`, newest first:
  `date: YYYY-MM`, one plain sentence naming the paper and journal, `url:` the DOI link.
- Preprints: `data/preprints.json` links each preprint (arXiv, bioRxiv,
  Research Square, SSRN, ...) to its journal version. Review two lists in it:
  - `unmatched`: older preprints the script could not pair. Find the journal
    version (titles often change on publication; same first author and topic)
    and record the pair under `preprint_of:` in
    `data/publications_overrides.yaml` (preprint id -> journal DOI). If it was
    never published, add the id to `standalone_preprints:`.
  - `standalone`: shown on the site as unpublished. For each, check whether a
    journal version has appeared (search Crossref by title and by first author);
    if so, add it to `preprint_of:`.
  Then rerun `python3 scripts/sync_preprints.py`. Report every pairing you added.
- Do not edit `profile.yaml > metrics` or `data/scholar_citations.json`: the
  Google Scholar snapshot task (11th of each month) keeps both current.

Commit these to `main` with a message like "Monthly refresh: publications, news".

### 2. Look for new information about Roberto (needs his approval)

Search his Gmail and Google Calendar (all calendars he owns, in particular
"Roberto - Work", not only the primary one) for the period since the last run,
looking for things that belong on a professional website:

- invited talks, keynotes, plenary lectures and seminars he gave or has firmly
  accepted (event name, place, month, title if known)
- grants awarded to him (not applications), with funder, years, role, amount
- prizes, fellowships, elected or appointed roles, editorial or committee
  positions, conferences he chairs or organises
- teaching changes (new courses) and completed PhD theses he supervised

Rules:
- Open the full email thread or event before using it; a search snippet is not
  enough to decide that something happened or was accepted.
- Never use anything confidential: grant applications or proposals under review,
  patent or invention work, refereeing and editorial manuscripts, hiring
  decisions, budgets, internal university matters, health or family matters,
  private meetings. When in doubt, leave it out.
- Only publish names of other people when they are already public (for example
  on the SoMeX website or in a paper).

Put everything you found on a new branch `update/YYYY-MM`, edit the right YAML
file (`news.yaml` for news and talks, `research.yaml` for grants,
`about.yaml` for roles and honours, `teaching.yaml` for teaching), run
`python3 build.py --check`, and open a pull request titled
"Website update for <Month YYYY>". In the pull request description list each
change with the source it came from (email subject and date, or calendar event
and date) so Roberto can check it quickly. Do not merge it.

If nothing new was found, do not open a pull request.

### 3. Report

End with a short summary for Roberto: what went live, what is waiting in the
pull request (with its link), and anything that looked relevant but you left out
because you were unsure.

## Writing style for site text

- Plain words, short sentences, few acronyms (spell out on first use).
- ASCII punctuation only: straight quotes, hyphens instead of dashes. Proper
  names keep their accents (Boesecke stays Bösecke, Nørgaard stays Nørgaard).
- Bio and news in the third person in `about.yaml > bio` and `short_bio`;
  first person elsewhere (home intro, research, teaching).
- Milan career: postdoctoral researcher 2004-2006, Ricercatore Universitario
  (permanent) 2007-2015, Associate Professor (permanent) 2015-2021. His only
  degree before the PhD is the Laurea in Physics (2001); there is no separate
  bachelor's degree.
- "Selected service and roles" is a selection, not a complete list.
- The lab name is spelled SoMeX.
- Giant Fluctuations is on hold: do not present it as upcoming.
- Industry research contracts are mentioned only in general terms: never name
  the companies.
- Do not add grant review panels or grant reviewing (European Research Council
  or any other funder) to the bio, roles or news: Roberto finds them meaningless
  there.

## Where things live

| What | File |
| --- | --- |
| Name, title, contact, IDs, citation figures | `content/profile.yaml` |
| Biography, CV, service and roles | `content/about.yaml` |
| Research themes, lab, grants | `content/research.yaml` |
| Courses, teaching innovation, mentoring | `content/teaching.yaml` |
| News and talks | `content/news.yaml` |
| Publication tags (selected, review, cover), hidden items, fixes, preprint pairings | `data/publications_overrides.yaml` |
| Preprint links (generated) | `data/preprints.json` |
| Per-paper citations, free full text (generated) | `data/metrics.json` |
| Google Scholar counts per paper (written monthly by the separate Google Scholar snapshot task; preferred over `metrics.json` when present) | `data/scholar_citations.json` |
| Publication list (generated, do not edit by hand) | `data/publications.json` |
| Group news (generated) | `data/group_news.json` |
| Supervised and hosted people, read from the SoMeX people page (generated; corrections in `content/teaching.yaml > mentoring`) | `data/people.json` |

## Analytics

Google Analytics 4 (`content/profile.yaml > analytics > ga4`, the same property
the old Google Sites page used) loads only after a visitor accepts the consent
banner (`static/js/consent.js`); keep it that way. Preview builds leave it out.

## Do not move

`static/roberto.jpg`, `static/somex.png` and `static/univie.png` are published at
the site root (for example https://rcerbino.github.io/roberto.jpg) because
Roberto's email signature loads them from there. Keep their names and location.
