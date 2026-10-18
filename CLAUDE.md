# Personal HQ — guidance for Claude

Personal HQ is a local-first personal dashboard (learning, spending, wealth, events). It is a
Vite + React 19 + TypeScript SPA. All user data lives in the browser's IndexedDB (via Dexie).
There is no backend except a tiny optional dev/preview-server middleware that proxies read-only
iCloud calendar subscription (`webcal://`) feeds.

## Commands

```bash
npm install          # install deps
npm run dev          # dev server on http://localhost:5173
npm run build        # typecheck (tsc -b) + production build
npm run preview      # serve the production build (also serves the ICS proxy)
npm test             # vitest (unit tests for business logic + repositories)
npm run typecheck    # tsc only
```

Always run `npm run typecheck && npm test` after non-trivial changes.

## Architecture (keep these layers separate)

```
src/
  app/          App shell: router, layout, sidebar, command palette, providers
  components/   Reusable UI primitives (ui/) and shared widgets (charts/, heatmap, forms)
  modules/      One folder per dashboard: home, learning, spending, wealth, events, trackers, settings
  domain/       Pure business logic — no React, no Dexie. Fully unit-tested.
                (streaks, budgets, finance/xirr, recurrence, ics parse/serialize, csv, search)
  data/         Persistence: Dexie schema (db.ts), typed models (models.ts), zod schemas
                (schemas.ts), repositories (repos/*), backup/restore, demo data
  integrations/ Calendar integration adapters (ICS file, subscription). Modular so a CalDAV
                backend or native app can be added later.
  lib/          Small helpers (dates, timezone, money formatting, ids, cn)
server/         Vite middleware for the read-only ICS subscription proxy (no secrets stored)
```

Rules:
- UI never talks to Dexie directly — go through `src/data/repos/*` (writes) and the
  `useLiveQuery` hooks in `src/data/hooks.ts` (reads). This is the seam for future cloud sync.
- `src/domain/*` must stay pure and framework-free; add tests in `src/domain/__tests__`.
- Validate user input with zod schemas from `src/data/schemas.ts` before writing.
- Every destructive action uses the shared `confirm()` dialog.
- Dates: calendar dates are `YYYY-MM-DD` strings (local, no timezone). Instants are ISO UTC
  strings. Use helpers in `src/lib/dates.ts` / `src/lib/tz.ts`, never `new Date('YYYY-MM-DD')`.
- Money: plain numbers in the record's currency; `fxRate` converts to the base currency.

## Product invariants (do not break)

- No fabricated data: never invent live prices, returns, or sync success. Investment current
  value comes only from user-entered valuations (marked `actual` vs `estimate`) or a clearly
  labelled calculated FD estimate. Contributions are never counted as profit.
- Spending (transactions/budgets) and Wealth (investments/valuations) are separate modules with
  separate tables. Do not cross-wire their calculations.
- Demo data is opt-in, every demo row has `demo: true`, and Settings can remove it.
- Apple Calendar: no Apple ID / app-specific passwords are ever collected or stored. Supported
  paths are ICS import/export (manual) and read-only subscription to a public iCloud calendar
  link via the local proxy. Never claim bidirectional sync.
- The user's original OneDrive/Excel SIP spreadsheets are never modified; we only store links
  to them and import exported CSVs.
- No dead buttons and no fake success toasts — toasts only after the write resolves.

## Style

- Tailwind v4 with CSS variables defined in `src/index.css` (`--color-*` tokens). Dark charcoal
  base with violet/blue accents; each module has its own accent (`learning` violet, `spending`
  rose, `wealth` emerald, `events` sky). Light theme via `[data-theme=light]`.
- Components: functional, typed props, no default exports except route modules.
- Icons: `lucide-react`. Charts: `recharts`. Keep new dependencies to a minimum.
