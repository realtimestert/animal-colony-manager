# Animal Colony Manager

A **static, click-through demo** of colony-management software for a ferret research facility.

Open it on GitHub Pages (no server, no database). You are signed in as a demo admin. Edits stay in this browser (`localStorage`) until you hit **Reset demo data**.

**Repo:** [github.com/realtimestert/animal-colony-manager](https://github.com/realtimestert/animal-colony-manager)

**Live demo** (after Pages is enabled on `main` / root):
[https://realtimestert.github.io/animal-colony-manager/](https://realtimestert.github.io/animal-colony-manager/)

This is a trimmed public showcase. It is not the production application and it does not contain live animal records.

## Try this

- Auto-login is **demo admin**. If you see the sign-in card: username `demo`, password `demo`.
- Dashboard → Find by RFID → `31010` (Nova).
- Statistics → genetics: Maple × Birch offspring sit near **F = 0.25** (full-sib parents).
- Litters: staged nests (newborn / soft-food / wean / scored).
- **Reset demo data** in the sidebar restores the seed colony.

## What you can click through

- **Dashboard** — colony counts, find-by-name, find-by-RFID (last 5+ digits), reproductive board, weight and grooming alerts, maternity tasks, vaccines due
- **Ferrets** — active / research / pending / distributed / deceased cards and full detail tabs
- **Litters + maternity** — staged litters, care checklist, wean / create individuals, separate kits
- **Genetics** — coefficient of inbreeding and relatedness on Statistics
- **Medical + death log** — health events, vaccinations, structured death records
- **Statistics + Reports** — population, pyramid, reproduction, deaths, infant mortality
- **Batch Care** — baths, nail trims, vaccinations for several animals at once

## How the demo runs

GitHub Pages can only host static files. The production app is a Node + MySQL SPA; this repo keeps the UI and replaces `/api/*` with an in-browser mock:

1. `js/seed.js` defines `window.ACM_SEED` (fictional colony).
2. `js/mock-api.js` wraps `window.fetch` and answers `/api` calls from that seed.
3. Writes persist in `localStorage` under `acm_demo_store`.
4. **Reset demo data** restores the fictional colony.

Serve the folder (or use Pages). You do not need Docker or MySQL.

To turn on Pages: repo **Settings → Pages → Deploy from a branch → `main` / `/` (root)**.

## Mock colony

Fictional names and rooms only. Three-generation pedigree so inbreeding coefficients are not all zero. Example RFID: type `31010` to find Nova. Photos are placeholders.

## What was left out on purpose

Users admin, activity log, bug-report inbox, cleaning reports, suppliers, locations page, emergency-vet stub, Smartsheet importers, farm backup scripts, and any live records.

## License

MIT — see [LICENSE](LICENSE). The production colony application remains separate and is not published here.
