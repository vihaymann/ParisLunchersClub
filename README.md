# The Paris Lunchers Club

A private members' club for curated lunches in Paris. This repo contains the working prototype: public landing, members sign-in, application flow, and a staff back-of-house with applications, members, lunches, and a data room.

**Static HTML / vanilla JS** — open any `.html` file in a browser. No build step.

## Get started
```bash
# Serve locally (any static server works)
npx serve .
# then open http://localhost:3000
```

Or just double-click any HTML file.

## Stack
- Hand-written HTML / CSS / JS, no framework.
- Fonts: Geist (display), Inter (UI), Instrument Serif (italic emphasis).
- Persistence: `db.js` — a localStorage-backed mock backend. **See `CLAUDE.md` for the migration plan.**

## Files
| File | What |
|---|---|
| `The Paris Lunchers Club.html` | Public landing page |
| `Sign In.html` | Members sign-in (mock) |
| `Apply.html` | 10-step membership application |
| `Staff.html` | Staff back-of-house — login + left-rail dashboard |
| `staff-dashboard.js` | Staff app controller (routing, tables, SVG charts) |
| `db.js` | Mock backend, the only file that touches storage |
| `assets/fork-cursor.png` | Custom pink-fork cursor |

## Demo staff login
`staff@plc.com` / `lunch2026` — defined in `db.js`, **rotate before production**.

## Resetting the demo data
- "Reset demo" link in the Staff workspace top bar
- or `TPLC.resetAll()` in the browser console

## Next steps
Read `CLAUDE.md` — it's the brief for whoever (or whatever) picks this up next: what the prototype does, the design system tokens, the data shapes, and what's needed to turn this into a real product.

## License
Private.
