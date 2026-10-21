# Instructions for Claude: maintaining cerbino.eu

This repository is Roberto Cerbino's personal website. It is a small static site:
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
python3 scripts/sync_group_news.py
python3 build.py --check
```

- If `build.py --check` prints warnings, fix them (usually a DOI in
  `content/research.yaml` that is no longer in the list) before committing.
- For every new journal article or review that appeared in
  `data/publications.json` since the last run (compare with `git diff`), add a
  news item to `content/news.yaml`, newest first:
  `date: YYYY-MM`, one plain sentence naming the paper and journal, `url:` the DOI link.
- Check whether the preprint(s) in the list have been published; the sync script
  does this by title, but if a published version exists under a different title,
  add the arXiv title to `hide:` in `data/publications_overrides.yaml`.
- Update `profile.yaml > metrics` only if you can read current figures from the
  Google Scholar profile; otherwise leave them.

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
- For his Milan career say "faculty member"; do not name the Associate
  Professor rank.
- The lab name is spelled SoMeX.
- Giant Fluctuations is on hold: do not present it as upcoming.

## Where things live

| What | File |
| --- | --- |
| Name, title, contact, IDs, citation figures | `content/profile.yaml` |
| Biography, CV, service and roles | `content/about.yaml` |
| Research themes, lab, grants | `content/research.yaml` |
| Courses, teaching innovation, mentoring | `content/teaching.yaml` |
| News and talks | `content/news.yaml` |
| Publication tags (selected, review, cover), hidden items, fixes | `data/publications_overrides.yaml` |
| Publication list (generated, do not edit by hand) | `data/publications.json` |
| Group news (generated) | `data/group_news.json` |

## Do not move

`static/roberto.jpg`, `static/somex.png` and `static/univie.png` are published at
the site root (for example https://rcerbino.github.io/roberto.jpg) because
Roberto's email signature loads them from there. Keep their names and location.
