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

- (talks are not part of this step: the "Talks list update" task below looks
  after them every two weeks)
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
file (`news.yaml` for news, `talks.yaml` for talks, `research.yaml` for grants,
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

Add two reminders to the summary when they apply:
- For each new journal article or review added this month: remind Roberto to
  announce it on Bluesky, LinkedIn and X, linking the paper (DOI link), and give
  the link.
- For each talk, seminar or lecture in his calendars ("Roberto - Work" and the
  others he owns) in the coming five weeks: remind him to put cerbino.eu or the
  QR code (static/img/qr-cerbino-eu.png and .svg, also at
  https://rcerbino.github.io/img/qr-cerbino-eu.png) on the last slide, naming
  the event and date.

## Talks list update (scheduled task, every two weeks)

Keeps `content/talks.yaml` complete. Changes go live only after Roberto
approves them.

1. Find the last check: the newest of (a) the date of the last commit that
   touched `content/talks.yaml` (`git log -1 --format=%cs -- content/talks.yaml`)
   and (b) the creation date of the last pull request titled "Talks update"
   (`gh pr list --state all --search "Talks update in:title" --limit 1`).
   Look at everything since then, with a few days of overlap.
2. Open pull request: if a "Talks update" pull request is still open, Roberto
   has not answered it yet. Add new findings to that branch and pull request
   instead of opening a second one, and mention it again in the report.
3. Talks folder on Roberto's Mac: `/Users/roberto/Documents/docs/talks` (in
   device_bash: `$HOME/mnt/talks`). One subfolder per year, one folder per
   talk inside it. List the folders of the current and the previous year with
   their file dates, and look at every folder created or changed since the last
   check. Read the title slide with
   `python3 scripts/slide_text.py <file.key|file.pptx|file.pdf>` (copy the
   script to the Mac first, or stage the file into the container). Abstracts,
   programmes or invitations saved in the folder help too. The file save time is
   a clue to the date, not proof. Skip group meetings, project meetings,
   committee and internal university presentations, and talks by other people
   kept as material.
4. Gmail and Google Calendar: search the same period for talks, seminars,
   colloquia, lectures at schools and keynotes Roberto gave (invitations he
   accepted, programmes, "thank you for your talk" messages, travel for a
   talk). Read every calendar he owns (call list_calendars; the work calendar
   is "Roberto - Work"). Search results show only the ~5 oldest messages of a
   thread with no marker: always open the full thread with get_thread before
   deciding. Add only talks that have already taken place. List talks
   scheduled for the coming weeks in the report, but do not add them yet.
5. For each talk found, compare with `content/talks.yaml` (it may already be
   there under another wording). Also correct an existing entry when a source
   clearly shows a wrong date, event or kind. For new entries use the exact day
   when a programme, email or slide gives it, the title as on the title slide,
   the official event name, "City, Country" as place (accents kept), and kind
   (plenary, keynote, invited, contributed, seminar, colloquium, lecture,
   public, teaching; "invited" only when the invitation or programme says so).
   Talks given by co-authors are not listed.
6. If there is something to change: work on a branch `talks/YYYY-MM-DD` (or
   the open one), edit `content/talks.yaml` (newest first, same format), run
   `python3 build.py --check`, push, and open a pull request titled
   "Talks update YYYY-MM-DD". In its description, list each change as one line
   with its source (folder and file, email subject and date, calendar event, or
   web page). Never merge it yourself.
7. If Roberto replies in the run's session to approve (all, or some items),
   apply exactly what he approved, merge the pull request into main with
   `gh pr merge --squash`, wait for the "Build and publish" workflow to finish,
   and check https://rcerbino.github.io/talks/ shows the change. If he asks for
   changes, edit the branch first. If he rejects an item, drop it and note it in
   the pull request so later runs do not propose it again.
8. Report (it becomes his notification), ASCII only, short: the proposed
   changes, one line each, with the pull request link; how to approve (merge
   the pull request on GitHub, or reply "approve" or "approve 1, 3" to this
   run); talks coming up in the next five weeks, with a reminder to put
   cerbino.eu or the QR code on the last slide. If nothing was found and no pull
   request is waiting, say "No new talks since <date>".

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
- Links on the About page: in `about.yaml > bio` write `[text](url)`, or
  `[text](site:research/#space)` for a page of this site; list entries
  (positions, stays, honours, service) take a `url:` field. Link only to pages
  that exist and load; leave an entry plain if there is no good page.
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
| News | `content/news.yaml` |
| Talks (all of them, newest first; the Talks page shows them all, the News page the six most recent). Each has `date`, `title`, `event`, `place` and a `kind`: plenary, keynote, invited, contributed, seminar, colloquium, lecture, public or teaching. Proper names keep their accents (Düsseldorf, Cargèse). Talks given by co-authors are not listed. | `content/talks.yaml` |
| DDM page sources (built into `static/ddm/index.html` by `python3 ddm/build.py`) | `ddm/` |
| Publication tags (selected, review, cover), hidden items, fixes, preprint pairings | `data/publications_overrides.yaml` |
| Preprint links (generated) | `data/preprints.json` |
| Per-paper citations, free full text (generated) | `data/metrics.json` |
| Google Scholar counts per paper (written monthly by the separate Google Scholar snapshot task; preferred over `metrics.json` when present) | `data/scholar_citations.json` |
| Publication list (generated, do not edit by hand) | `data/publications.json` |
| Group news (generated) | `data/group_news.json` |
| Supervised and hosted people, read from the SoMeX people page (generated; corrections in `content/teaching.yaml > mentoring`) | `data/people.json` |
| Visiting senior scientists (collaborators, shown on the Research page under The lab): `group: scientists` in `content/teaching.yaml > mentoring > extra` | `data/people.json` |

## DDM pages (/ddm/)

"DDM, hands on" is a set of self-contained pages that simulate DDM experiments and analyse them in the
visitor's browser (nothing is uploaded, no outside service is contacted). Sources are in `ddm/`;
`python3 ddm/build.py` assembles them into `static/ddm/`, which is committed and copied to the site, and
`build.py` then writes the main menu into each page (marker `<!--SITE-NAV-->`, entries in `EXTRA_PAGES`).

- Landing page /ddm/ (`static/ddm/index.html`, from `landing.src.html`): one card per application and the
  shared steps drawn live from a small sketch movie; no reader levels (each application page has its own).
  Old links with a hash (/ddm/#student) are sent on to /ddm/sizing/.
  A new application gets a card here, an entry in `PAGES` and `PREVIEW_LINKS` in `ddm/build.py`, an
  `EXTRA_PAGES` entry with None, and a link in the switch under each application title.
- "Sizing particles" /ddm/sizing/ (`static/ddm/sizing/index.html`): `page.src.html` with the styles and text,
  `app.js` the page logic, `optics.js` image formation, `movie.js` the simulated movie, `ddm-engine.js` the
  analysis, `worker.js`, `data/` Nikon objectives.
- "Swimming cells" /ddm/swimmers/ (`static/ddm/swimmers/index.html`): `swim.src.html`, `app-swim.js`,
  `active-engine.js` and `worker-swim.js`; it shares the optics, movie and engine files.

Both application pages have a fourth reader level, "Addict" (`#addict`): one switch for each step the
analysis adds to the published method (`x_*` settings in `app.js` and `app-swim.js`, mapped to engine options;
`opts.published_only` switches them all off), and a "published method only" row computed on the same movie.
Each such step is described in the methods text and listed under "What this page adds to the published
methods" (no tags in the text). A new step that is not in the cited papers gets both a list entry and a switch.

Shared links: the address of an application page holds the level and every setting that differs from `BASE`
(`#student/diameter_um=0.5&mode=fluorescence`, objectives by name); a new setting must live in `BASE` to be
shareable. "Download the movie" writes the analysed frames as a 32-bit TIFF (`tiff.js`, used by both pages).

After any change to the sources: run `python3 ddm/build.py`, then `python3 build.py --check`, and commit
both. Checks: `cd ddm && node test-optics.js data/mie_ref.json && node test-engine.js && node test-movie.js`
(the last takes several minutes), and for the swimmers `node test-swim.js && node test-active.js`.
`python3 ddm/build.py --preview` writes stand-alone copies (`ddm-landing.html`, `ddm-hands-on.html`,
`ddm-swimmers.html`, linked to each other, Google Fonts) for previews outside the site; do not commit them.
The page text follows the writing style above; it must stay ASCII (the build refuses other characters).

## Analytics

Google Analytics 4 (`content/profile.yaml > analytics > ga4`, the same property
the old Google Sites page used) loads only after a visitor accepts the consent
banner (`static/js/consent.js`); keep it that way. Preview builds leave it out.

## Legal notice and privacy

`templates/legal.html` (page /legal/, linked from the footer) holds the legal
notice under the Austrian Media Act and the privacy statement. It lists every
outside service the site contacts: GitHub Pages hosting, Google Analytics (only
after consent), Altmetric badges, pictures from the SoMeX site. Fonts are served
from the site itself (`static/fonts`, `static/css/fonts.css`); do not go back to
Google Fonts. If you add or remove any outside service, update the privacy
statement and its date in the same change.

## Search engines

The site is verified in Google Search Console (property
https://rcerbino.github.io/, sitemap submitted) with the meta tag in
`content/profile.yaml > site_verification`. Never remove that tag. Each page has
its own search description in `content/profile.yaml > descriptions`.

## Do not move

`static/roberto.jpg`, `static/somex.png` and `static/univie.png` are published at
the site root (for example https://rcerbino.github.io/roberto.jpg) because
Roberto's email signature loads them from there. Keep their names and location.
