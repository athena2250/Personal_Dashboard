# Personal HQ

A local-first personal operating system for **learning**, **spending**, **wealth** and **events**: one overview dashboard plus four independent dashboards, a reusable tracker builder, global search, and backup/restore. Everything runs in your browser and is stored in IndexedDB on your machine.

## Quick start

Requires Node.js 20+ (tested on Node 26).

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build (includes the calendar proxy) on http://localhost:4173 |
| `npm test` | Unit tests (domain logic + repositories against an in-memory IndexedDB) |
| `npm run typecheck` | TypeScript only |

On first launch you can **Start fresh** (empty dashboards) or **Explore with demo data**. Demo rows are labelled `[Demo]`, flagged in the database, counted in totals while loaded, and removable in one click from the banner or **Settings → Storage & demo data**.

## What's inside

| Module | Highlights |
|---|---|
| **Overview** | Greeting, today's tasks and events, learning streak and weekly progress, monthly spend and remaining budget, invested capital, value and net worth, quick actions, customisable widgets (drag to reorder, show/hide), ⌘K global search |
| **Learning Hub** | Unified activity log, streaks, heatmap, weekly trends, plus four built-in trackers: **Coding** (problems, languages, topics, difficulty, links), **AI/ML** (topics, courses, papers, projects with milestones and completion %), **Coding Applications** (projects, stack, repo and deploy URLs, next actions, deadlines, time per project), **GRE/TOEFL** (section practice, mock tests with score trends vs targets, test dates, vocabulary with spaced review, revision schedule) |
| **Custom trackers** | Create trackers from the UI (books, fitness, certifications…) with custom fields (text, long text, number, currency, date, checkbox, dropdown, URL), statuses, categories, goals, and table, card or calendar views. Edit, archive or delete them later. |
| **Spending Control** | Transactions (add, edit, delete, search, filter, bulk delete, multi-currency with manual FX rate), custom categories and subcategories, monthly budgets per category with month overrides and warnings, recurring transactions (manual or auto-record), monthly and yearly reports, CSV import (with column mapping, dedupe and undo) and export |
| **Wealth Tracker** | SIPs, mutual funds, FDs, stocks/ETFs, cash and custom assets, plus liabilities. Contributions history, SIP installments, manual valuations (actual vs estimate), FD maturity calculation, allocation, net worth over time, monthly and yearly summaries, XIRR, CSV import, links to your original spreadsheets |
| **Events Calendar** | Month, week, day and list views, all-day and timed events, repeats, reminders, categories with colours, links to trackers and projects, ICS import and export, read-only iCloud subscriptions |
| **Settings** | Theme (dark, light, system), base currency, timezone, week start, budget warning threshold, widgets, payment methods, event categories, notifications, storage info, backup and restore, erase |

Every list has empty states, every destructive action asks for confirmation (high-impact ones require typing a phrase), and success messages only appear after the write to IndexedDB has finished.

## Architecture

**Stack:** Vite + React 19 + TypeScript (strict), Tailwind CSS v4, Dexie (IndexedDB), Recharts, React Router 7, zod, lucide-react, PapaParse. Calendar views and the ICS/RRULE engine are custom-built; no calendar library was needed.

**Why Vite rather than Next.js:** the app is local-first with no server-side data, so a static single-page app is simpler to run and host. The only server-side piece is a small calendar proxy that runs inside the Vite dev/preview server. Moving to Next.js later (for auth and cloud sync) only touches the app shell. The domain and data layers don't depend on the framework.

```
src/
  app/          Shell: router, layout/sidebar/mobile nav, ⌘K palette, quick-add dialogs, app context
  components/   UI primitives (ui/), charts (charts/), dynamic field renderer, submit hook
  modules/      home, learning, trackers, spending, wealth, events, settings
  domain/       Pure, tested business logic: streaks/activity, spending, wealth/XIRR, recurrence,
                ICS parse/serialize, RRULE expansion, CSV, search
  data/         Dexie schema, typed models, zod schemas, repositories, live-query hooks,
                defaults, demo data, backup/restore, save-status store
  integrations/ Calendar adapters (ICS file, subscription), with a CalendarAdapter interface for future sync
  lib/          Dates (DST-safe), timezone (Intl), money formatting/parsing, utilities
server/         Read-only ICS subscription proxy (Vite middleware)
```

Rules the code follows (also in `CLAUDE.md`):

- UI reads through live-query hooks (`data/hooks.ts`) and writes only through repositories (`data/repos/*`). That repository layer is the seam for cloud storage later.
- All input is validated with zod before it is written. Validation errors map to form fields.
- Calendar dates are `YYYY-MM-DD` strings. Instants are UTC ISO strings and are displayed in your configured timezone.

### Data model (IndexedDB database `personal-hq`)

`settings`, `tasks`, `trackers` (definitions incl. custom fields/statuses/goals), `records` (tracker items; `kind` = item / mock / vocab), `sessions` (the unified learning log), `transactions`, `categories`, `budgets`, `recurring`, `investments`, `invTxns`, `valuations`, `events`, `calendarSources`, `kv`.

The four Learning Hub trackers are ordinary tracker definitions with a `template` that enables extra panels. New trackers reuse the same tables, so adding one never requires code changes.

### Financial calculation rules

- **Spending:** totals come only from recorded transactions, converted to your base currency with each transaction's own FX rate. No live rates are fetched. Savings rate = (income − expenses) ÷ income, and is shown only when income has been recorded.
- **Budgets:** a month-specific budget overrides the every-month default. Warnings start at your threshold (80% by default).
- **Invested capital** = contributions − withdrawals. Contributions are never counted as profit.
- **Current value** comes only from:
  - your latest valuation (marked *actual* or *estimate*), plus any contributions recorded after it;
  - an FD estimate calculated from principal, rate and compounding (labelled as calculated);
  - for cash accounts, the balance from recorded flows.
  
  Otherwise the value is shown as "—" and the holding is excluded from returns. Net worth counts unvalued holdings at cost and says so.
- **Return** = (unrealised gain + interest/dividends paid out − fees) ÷ net invested. XIRR is shown only when a valuation exists.
- No live prices or returns are fabricated anywhere.

## Apple Calendar integration: what was investigated and what's implemented

| Option | Status |
|---|---|
| ICS **import** (Apple Calendar → File → Export) | ✅ Implemented. Matches events by UID (and RECURRENCE-ID), so re-imports update instead of duplicating. Handles TZID, floating, all-day, DURATION, RRULE/EXDATE, alarms and cancellations. |
| ICS **export** (open the `.ics` on Mac or iPhone) | ✅ Implemented. Stable UIDs mean re-exports update the same events in Apple Calendar. Includes alerts and repeat rules. Recurring timed events keep their timezone. |
| **Subscription** to a public iCloud calendar (`webcal://…icloud.com/published/…`) | ✅ Implemented, **read-only**. Fetched server-side by the local proxy (browsers can't fetch iCloud directly because of CORS). Mirrors additions, changes and deletions. Refreshes manually or every 30 min/1 h/6 h while the app is open. Shows last successful sync, last attempt and the last error. |
| Two-way sync via iCloud **CalDAV** | ❌ Not implemented, deliberately. iCloud CalDAV has no OAuth and needs your Apple ID plus an app-specific password. Collecting or storing that in a browser app isn't safe. |

Secure ways to get two-way sync later:

1. A native macOS/iOS companion app using **EventKit**. The OS grants calendar permission and no password is involved.
2. A self-hosted backend that keeps an app-specific password in server-side secret storage and talks CalDAV.

Either can implement the `CalendarAdapter` interface in `src/integrations/calendar.ts` without UI changes.

**Proxy security:** it accepts only https/webcal URLs, rejects URLs containing credentials, and only fetches from hosts on an allowlist (`*.icloud.com` by default; extend it with `ICS_PROXY_ALLOWED_HOSTS`, see `.env.example`). It caps responses at 5 MB and 15 s, requires an iCalendar body, and never logs feed URLs. A public calendar link works like a password: anyone who has it can read that calendar. It is stored only in your browser.

**Reminders:** event reminders appear as browser notifications only while Personal HQ is open (enable them in Settings). For reminders when the app is closed, export events to Apple Calendar; alerts are included in the export.

## Your existing SIP spreadsheets

Personal HQ never connects to OneDrive and never edits, replaces or migrates your Excel files. To bring the data in:

1. In Excel Online, download a **CSV copy** of the sheet.
2. Import it under **Wealth → Import & spreadsheets**. It maps columns, handles day-first dates, and skips exact duplicates, so re-importing an updated copy is safe.
3. Optionally add a link to the original workbook on each holding (Edit → Links) for one-click access.

You don't need to connect any financial account.

## Storage, backup and the future

- Data lives in this browser profile only. Use **Settings → Backup & restore** to download a JSON backup and restore it (merge or replace) on another browser or device. **Request persistent storage** asks the browser not to evict your data.
- Static hosting (e.g. `dist/` on any CDN) works for everything except subscriptions, which need the proxy that ships with `npm run dev` / `npm run preview`.
- Ready for: authentication and cloud storage behind the repository layer; per-row `updatedAt` timestamps for sync conflict resolution; schema versioning in Dexie and in backups.

## Testing

```bash
npm test
```

59 unit tests cover:

- streaks, heatmaps, goals and period ranges;
- budgets, savings rate, recurrence (month-end clamping) and yearly reports;
- FD maths, valuation and return rules, net worth series and XIRR;
- CSV/amount/date parsing;
- ICS parsing/serialisation (TZID, DST, folding, escaping) and RRULE expansion;
- repository behaviour: validation, cascade deletes, category rename cascade, import dedupe, recurring auto-post, SIP installments, subscription mirroring, backup round-trip, demo removal.
