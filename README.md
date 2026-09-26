# ARIES Center website

Source of the ARIES Center website (Department of Civil Engineering, Kasetsart University), built with Astro and published on GitHub Pages.

- Content lives in `src/data/*.json`; pages in `src/pages/`; one stylesheet in `src/styles/global.css`.
- `npm run pubs` refreshes `src/data/publications.json` (works found in OpenAlex, described from CrossRef by DOI; fixes in `src/data/pub-overrides.json`).
- `npm run check-launch` blocks publishing while anyone listed has not given consent; the deploy workflow runs it first.
- `python scripts/preview-shots.py` screenshots every built page into `shots/` for review.
- Maintenance guide (Thai): [MAINTAINER.md](MAINTAINER.md).

Hosting: repository `ARIES-KU/aries-ku.github.io`, Settings > Pages > Source: GitHub Actions. When the domain is registered, set `site` in `astro.config.mjs`, add `public/CNAME` with the domain, and set the custom domain in Settings > Pages.

Design history and decisions: Research Empire, `career/aries_website_plan_2026-09.md`. The single-file prototypes (navy and white) and the generated images live next to this repository in the center's Drive folder `06_Website/` (`prototype/`, `images_generated/`).
