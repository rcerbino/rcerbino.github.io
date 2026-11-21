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
  The cards are in three groups: Start here (sizing, and a card for the exercises), Classic applications (swimmers,
  drift, rheology) and Advanced applications (crowded, proteins, shear, tissues); the switch under each application
  title shows the same groups (Start, Classic, Advanced). Group headings and notes are translated in `landing_i18n.py`.
  A new application gets a card in its group, an entry in `PAGES` and `PREVIEW_LINKS` in `ddm/build.py`, an
  `EXTRA_PAGES` entry with None, and a link in its group of the switch under each application title.
- "Sizing particles" /ddm/sizing/ (`static/ddm/sizing/index.html`): `page.src.html` with the styles and text,
  `app.js` the page logic, `optics.js` image formation, `movie.js` the simulated movie, `ddm-engine.js` the
  analysis, `worker.js`, `data/` Nikon objectives.
- "Swimming cells" /ddm/swimmers/ (`static/ddm/swimmers/index.html`): `swim.src.html`, `app-swim.js`,
  `active-engine.js` and `worker-swim.js`; it shares the optics, movie and engine files.
- "Drifting particles" /ddm/drift/ (`static/ddm/drift/index.html`): `drift.src.html`, `app-drift.js`,
  `drift-engine.js` (velocity from the cross spectrum, fitted through its imaginary part at all delays and all q so that
  drifts too slow to make any pattern swing still count, as in tracking; uncertainty from two jackknifes in quadrature;
  a drift is reported when it exceeds three times its uncertainty; D from the structure function with the depth of
  field; the published method for the Addict row is phase differential microscopy, phiDM, Colin, Zhang and Wilson 2014) and
  `worker-drift.js`; spheres only (colloids, no interactions). Causes: flow (plug or Poiseuille), sedimentation
  (microscope upright or on its side), thermophoresis with Soret coefficients from Duhr and Braun 2006, Iacopini,
  Rusconi and Piazza 2006, Braibanti, Vigolo and Piazza 2008, and Helden, Eichhorn and Bechinger 2015 (`THERMO` in
  `app-drift.js`).

- "Liquid or solid" /ddm/rheology/ (`static/ddm/rheology/index.html`): microrheology with tracer beads. `rheo.src.html`, `app-rheo.js`,
  `rheo-engine.js` (f to the mean squared displacement at each q with the depth of field, A from the mean power (smoothed over q
  when the sample is frozen), B from the camera, q combined by their noise, jackknife over ten parts of the movie; moduli from a
  fitted retardation spectrum, Mason's formulas for comparison; the "plain method" row: A = 2 var - B, B from the first delays,
  Mason) and `worker-rheo.js`. The material is simulated exactly in `visco.js` (solvent + Maxwell modes + plateau, the bead an
  Ornstein-Uhlenbeck process obeying the generalised Stokes-Einstein relation; `movie.js` option `visco`). Materials in `VE` in
  `app-rheo.js`; the concentrated micelles from Lennon et al., J. Rheol. 64, 1263 (2020). Method: Edera et al., Phys. Rev.
  Materials 1, 073804 (2017). Check: `node test-rheo.js`.

- "Crowded particles" /ddm/crowded/ (`static/ddm/crowded/index.html`): concentrated suspensions, structure factor S(q) and
  collective diffusion D(q). `crowd.src.html`, `app-crowd.js`, `crowd-engine.js` (S(q) = (A/N) / (A_ref/N_ref) against a dilute
  reference movie of the same particles, `referenceConfig`: 4 %, no interactions, long enough to wander through the box depth
  twice; short-time rate from a line through ln f down to f = 0.6; D(q) = D0 Gamma / Gamma_ref; reference smoothed over q;
  published row: B from the first delays, line through f = 1, D = Gamma / q^2, reference bin by bin) and `worker-crowd.js`
  (simulates the movie and the reference). The particles push each other in `movie.js` option `interact`: Brownian dynamics
  of hard spheres (Heyes-Melrose overlap removal) or hard spheres plus Yukawa repulsion, periodic box, no hydrodynamic
  interactions (said on the page; tried and dropped: a theory density field, and a grid flow solver, branch ddm-flow-wip); `truth.interact` holds the simulation's own S(q). Method: Lu et al.,
  Phys. Rev. Lett. 108, 218103 (2012). Check: `node test-crowd.js` (about a minute).

- "Proteins" /ddm/proteins/ (`static/ddm/proteins/index.html`): size and interactions of proteins in bright field. `protein.src.html`,
  `app-protein.js`, `protein.js` (pair potential: hard sphere of R_h, screened charge Z with the salt, short-range attraction eps;
  B2/A2, k_D = 2 A2 M - 6.55 v_h, D0, S(0) and D_c to first order in c), `field-movie.js` (the movie as a density field, not single
  proteins: cosine modes between the walls, each a random process with variance N S(0) and rate D_c (q^2 + k^2), exact averaging over
  the exposure), `protein-engine.js` (at each q: d = A g + B, B from the camera, g with the depth of field and the exposure; D the
  weighted mean of ln D; a series gives D0, k_D, R_h and the static A2 (called B2 in the paper) from two weighted lines, the second through c/<A>, i.e. <A> = k c / (1 + c/c0) as in Guidolin et al. eq. 5, plotted that way; the amplitudes refitted at the D of the line) and
  `worker-protein.js` (the bench: four movies analysed together; the series: five concentrations, each with its own seeds). Presets in
  `PROTEINS` in `app-protein.js`: an antibody (attraction set for k_D near -5 mL/g at 115 mM, Laber et al. 2022), albumin (radius and k_D as
  in Guidolin et al., Macromolecules 56, 8290, 2023), lysozyme and an illustrative sticky antibody. Standard bench: ORCA binned 2 x 2,
  condenser NA 0.1. Check: `node test-protein.js` (about two minutes).

- "Sheared materials" /ddm/shear/ (`static/ddm/shear/index.html`): echo-DDM under oscillatory shear. `shear.src.html`, `app-shear.js`,
  `shear-engine.js` (structure function at every delay up to three cycles and at whole cycles, log-spaced; sectors of +- 20 degrees along
  the flow and the vorticity; at the echoes only pairs starting at zero strain, and A from those frames (x_phase); B from the camera
  (x_noise; published: quadratic through the first three echoes); rate from a line through the origin of -ln f; jackknife over eight
  parts of the movie) and `worker-shear.js` (bench and strain sweep). The shear is in `movie.js` option `shear` (affine displacement
  relative to the focal plane, non-affine diffusion; bright field with the scattered-intensity term, `homodyne: true`, which beads of a
  micrometre or more need, or the image goes below zero and clips). Materials in `MATERIALS`/`rearrangements` in `app-shear.js`: the microgel set to
  Edera et al., Soft Matter 17, 8553 (2021), at 20 % and 80 %. Check: `node test-shear.js` (about a minute).
- "Moving tissues" /ddm/tissues/ (`static/ddm/tissues/index.html`): confluent monolayers, jammed, fluid or flocking. `tissue.src.html`,
  `app-tissue.js`, `tissue-movie.js` (self-propelled soft discs with alignment of polarity to velocity, nuclei as Gaussian spots;
  times in hours: the movie's frame_rate_hz is per hour), `tissue-engine.js` (sheet path from the phase of the widest patterns,
  frames moved back by it (x_comoving), MSD as a Gaussian over a q band above the peak of A, order psi, state) and `worker-tissue.js`.
  Step 6, the rate against q: `tissue-rates.js` fits f at every q with A > 3B with a model chosen on the page (`fit_model`: kww
  default, prw, cage, exp; a two-exponential model was tried and dropped: its rates jumped between q), ranks the four by BIC for the
  movie, and fits the self intermediate scattering function of the simulated cells (`truthFs`, from `truth.positions`, computed in
  the worker) with the same model. Step 5 draws the fitted model through the dots.
  Steps 6 and 8 carry `data-optional`: at the Curious level they are folded to a line and a "Show this step" button.
  Step 8, the network of nuclei: `tissue-voronoi.js` finds the nuclei in every frame (local maxima, sub-pixel from a log-parabola),
  links them (mutual nearest neighbours closer than half a spacing), cuts Voronoi cells by bisectors (kept only when complete inside
  the field; the truth uses the periodic box and `truth.positions` from `tissue-movie.js`), and gives the shape index, sides and the
  neighbours kept after a delay (an edge longer than a tenth of a spacing to count, any edge to stay); the sweep also plots the
  neighbours kept in 4 h. In this model the mean shape index moves little (3.77 solid, 3.83 fluid): say so, do not present it as a
  test of the vertex model. "Images analysed" (`channel`: nuclei, edges, both): `TISSUE_VORONOI.channelMovie` finds the nuclei
  again with the frame wrapping around, draws their periodic Voronoi network as lines of rms 1.5 um (wider than half a pixel:
  thinner lines sampled at pixel centres lock light to the pixels and hide the sheet's motion) with a nucleus's light per cell
  and camera noise, alone or added to the nuclei; the worker keeps each, and the page shows the images analysed in steps 2-3.
  Nuclei and edges cancel at the spacing of neighbours, so `tissue-engine.js` looks for the peak of A among patterns 0.6 to 2
  cells wide. Method: Giavazzi et al., Front. Phys. 6, 120 (2018); model after Giavazzi et al., Soft Matter 14, 3471 (2018). Check:
  `node test-tissue.js` (about two minutes).
- Exercises /ddm/exercises/ (`static/ddm/exercises/index.html`, from `exercises.src.html`, no app): questions with model answers for
  every page, one section per page (anchor = page name), linked from each page's "Go further" and from the landing page. A new
  page gets a section; numbers in the answers must match the page.

All application pages have a fourth reader level, "Addict" (`#addict`): one switch for each step the
analysis adds to the published method (`x_*` settings in `app.js`, `app-swim.js`, `app-drift.js`, `app-rheo.js`, `app-crowd.js`, `app-protein.js`, `app-shear.js` and `app-tissue.js`, mapped to engine options;
`opts.published_only` switches them all off), and a "published method only" row computed on the same movie.
Each such step is described in the methods text and listed under "What this page adds to the published
methods" (no tags in the text). A new step that is not in the cited papers gets both a list entry and a switch.

Shared links: the address of an application page holds the level and every setting that differs from `BASE`
(`#student/diameter_um=0.5&mode=fluorescence`, objectives by name); a new setting must live in `BASE` to be
shareable. "Download the movie" writes the analysed frames as a 32-bit TIFF (`tiff.js`, used by all application pages).

After any change to the sources: run `python3 ddm/build.py`, then `python3 build.py --check`, and commit
both. Checks: `cd ddm && node test-optics.js data/mie_ref.json && node test-engine.js && node test-movie.js`
(the last takes several minutes), for the swimmers `node test-swim.js && node test-active.js`, for the drift page `node test-drift.js`, for the rheology page `node test-rheo.js`, for the crowded page `node test-crowd.js`, and for the proteins page `node test-protein.js`, `node test-shear.js`, `node test-tissue.js`. `node test-text.js` (after `--preview`, with `NODE_PATH=$(npm root -g)`) checks in a browser that the page text follows the sample on the bench.
Notebooks for readers are in `static/ddm/notebooks/` (`ddm-sizing.ipynb` with fastDDM, `ddm-rheology.ipynb` with numpy and scipy for log-spaced frames, `ddm-crowded.ipynb` with numpy on the movie, the reference movie and the numbers file, `ddm-proteins.ipynb` with numpy on five movies of the antibody at 115 mM, 4.5 to 30 mg/mL). Each was run on the page's standard movie (downloaded TIFF and frame times); rerun them after a change to the analysis or to the export, and update the numbers quoted in them and on the pages.
`python3 ddm/build.py --preview` writes stand-alone copies (`ddm-landing.html`, `ddm-hands-on.html`,
`ddm-swimmers.html`, `ddm-drift.html`, `ddm-rheology.html`, `ddm-crowded.html`, `ddm-proteins.html`, `ddm-shear.html`, `ddm-tissues.html`, `ddm-exercises.html`, linked to each other, Google Fonts) for previews outside the site; do not commit them.
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
