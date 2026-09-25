# Animal Colony Manager

Static, click-through demo of a research-animal colony manager. The live product is a Node + MySQL app used to track a ferret research colony (identity, housing, lighting, breeding, genetics, medical care, and reports). This repository is a **trimmed public snapshot** so the interface can be opened on GitHub Pages with no server.

**Live demo:** [realtimestert.github.io/animal-colony-manager](https://realtimestert.github.io/animal-colony-manager/)

All animals, rooms, RFID chips, litters, and medical rows are fictional. Writes stay in this browser (`localStorage`). Use **Reset demo data** to restore the seed.

## What you can click through

- Dashboard, including Find by name and Find by RFID (try last-5 `31010`)
- Ferret cards and every tab on an individual animal
- Litters and the maternity path (nursing → soft-food → wean/chip → 6-month survival)
- Genetics / coefficient of inbreeding (Wright’s path method in the browser)
- Medical log, death log, and veterinarian communication notes
- Statistics and printable reports
- Batch Care plus grooming / vaccination alerts

Sign-in is automatic as a demo admin (`demo` / `demo` if you sign out).

## How this demo runs

There is no Express server and no MySQL on Pages. `js/mock-api.js` intercepts `fetch('/api/...')` and serves `js/seed.js` (`window.ACM_SEED`) from `localStorage`. Coefficient of inbreeding is computed with `js/genetics.js` (`window.SanusGenetics`).

Open `index.html` locally or enable GitHub Pages on `main` (root).

## Seed colony (short)

28 fictional ferrets across three generations.

| Animal | Role |
| --- | --- |
| Cedar, Pine, Willow, Hazel, Ivy | Sourced founders |
| Maple + Birch | Full siblings (Willow × Cedar) |
| LIT0004 kits (Rowan–Yarrow) | Inbred F ≈ 25% because the parents are full siblings |
| LIT0003 kits | Outbred wean/chip litter |
| Reed | On-site research |
| Ash | Pending off-site distribution |
| Sable | Distributed |
| Fern | Died while listed as mated (last 7 days) |

Staged litters: LIT0001 nursing (2 days), LIT0002 soft-food (21 days), LIT0003 wean/chip (42 days), LIT0004 scored 6-month survival (197 days).

## License

MIT. This demo is source-available so people can see the work. It is **not** the production farm database and does not include live animal records, import scripts, or operational host configuration.
