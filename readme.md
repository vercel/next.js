# RIZVITEAMS — Integrated Performance Management

Single-file root-level web app covering all legacy "RIZVI-*" modules in one place. Real employee master data (6,469 active employees) is wired in from the latest master sheet.

## Modules

| Module | What it shows |
|---|---|
| Dashboard | Animated rose KPI dashboard (red executive + yellow HR), live status ticker |
| World Dashboard | 17 modules in tile view |
| Employees | Full master sheet (real data) + bulk import + resign sheet auto-delete |
| Attendance / Punch | 10-second LAN sync agent bridge (port 7700) + CSV bulk import |
| Payroll | Salary sheet import linked to master Employee ID |
| Performance / KPI | Daily / Weekly / Monthly / Quarterly / Half / Year checklists |
| Evaluation System | Auto-generated Yearly + Half-Yearly Printable Evaluation |
| Complaints / Suggestions | Voice record + Word/PDF/Image upload |
| Training | Training records import |
| Work Updates | Voice notes + multi-format upload |
| Production Plan | Target / Achievement / Loss% / Recovery |
| Quality Control | Pass / Reject / Inspections |
| Merchandising | Buyer POs / T&A |
| Maintenance | Alerts / MTTR |
| **Inventory** | Stock register + minimum reorder alerts |
| **Fabric Purchase / Booking / Collection** | Vendor booking + received note |
| **Procurement** | PO tracking + bulk import |
| Compliance & Audit | BSCI / Sedex / WRAP / OEKO-TEX |
| Trims / Store | Buttons / threads / zipper stock |
| **Traceability** | Buyer lot → fabric → trims → carton trace |
| Field Duty / Live Location | Consent-based GPS tracking (opt-in, via employee's own app) |
| 39 Sections | Click a section to filter employees |
| Settings | Modify company info + payroll window + sync interval |

## Login

- **Admin** — sign in with the email in `RIZVI_ADMIN_EMAILS` (`rizvi-data.js`) via Firebase Authentication. Set the real password for that account in Firebase Console → Authentication → Users — it is never stored in this repo.
- **Employee** — Office ID card number **OR** Mobile number, with the password set for their account in Firebase Authentication once accounts are created there.

This repo is public — no real passwords are stored in code. See `DEPLOY.md` for how to create accounts in Firebase Console.

Admin and User panels are fully separated. Employee users see only their own dashboard and can never reach Admin Settings, Payroll, Evaluation, etc.

## Punch / Port 7700 — IMPORTANT

A browser/WebView cannot open a raw TCP socket to port 7700. This app therefore supports:

1. LAN sync agent (recommended) — small Python service running on the LAN that talks TCP to devices on port 7700 and exposes HTTP/JSON on the local network.
2. Direct device HTTP if firmware exposes it.
3. CSV / log import — accepts a full month of punch history in one shot.

Auto-sync runs every **10 seconds** (configurable in Settings).

## Firebase integration

The Firebase config (`izviteam`) is wired in `firebase-config.js`, using only the official Firebase compat SDK (free Spark tier). The app silently falls back to in-memory seed if Firestore is unreachable, so the UI never breaks.

## Deploy — see `DEPLOY.md`

Fully free hosting via GitHub + Firebase Hosting (Spark plan). No third-party app-wrapper services used or referenced.


