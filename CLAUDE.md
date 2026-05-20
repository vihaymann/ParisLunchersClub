# The Paris Lunchers Club — Claude Code brief

You're picking up an interactive HTML prototype for **The Paris Lunchers Club**, a private members' club for curated lunches in Paris. The prototype is fully functional — landing, sign in, member application flow, and a complete staff back-of-house with dashboards, member/application management, and a data room (MRR/ARR/charts). All persistence is currently **mock**, backed by `localStorage` through a single data-layer module.

Your job is to **turn this prototype into a real product**: replace the mock backend with a real one, harden the flows, and host it.

---

## Repository layout

```
.
├── The Paris Lunchers Club.html   Public landing page (hero, slot-reel headline, CTA → Apply)
├── Sign In.html                   Members entrance (mock passphrase login + topic cycle)
├── Apply.html                     10-step membership application (Name → … → Why → Review)
├── Staff.html                     Back-of-house shell (login → left-rail dashboard)
├── staff-dashboard.js             Controller for Staff.html — routing, tables, drawers, SVG charts
├── db.js                          Mock backend (localStorage). THE seam between UI and a real API.
├── tweaks-panel.jsx               Floating tweaks panel (design-time only, can be removed in prod)
└── assets/
    └── fork-cursor.png            Pink fork cursor used across all pages
```

Open any HTML file directly in a browser — no build step. Static files only.

---

## Visual / design system

| Token | Value | Where |
|---|---|---|
| `--bg` | `#0A0A09` | Ink black |
| `--ink` | `#F4F1EA` | Off-white |
| `--muted` | `#6E6B64` | Caption grey |
| `--muted-2` | `#A09B91` | Body secondary |
| `--line` | `#1F1E1B` | Hairline rules |
| `--field` | `#131211` | Input fill |
| `--field-line` | `#2A2925` | Input border |
| `--ok` | `#4F9B65` | Accept / positive delta |
| `--warn` | `#B58A3C` | Waitlist |
| `--danger` | `#C8513E` | Decline / negative delta |
| `--accent` | `#C9A37A` | Data-room accent (rate line) |

Typography:
- **Geist** — display sans (headings, KPI numbers).
- **Inter** — UI sans (labels, body, tracked-caps eyebrows).
- **Instrument Serif** (italic) — emphasis word inside headlines, "italic" runs in copy, captions on data cards.

Cursor: every interactive element uses the **pink fork** cursor (`assets/fork-cursor.png`, 64×64 PNG, hotspot at `32 4` — the tip of the tines). Loaded as `<link rel="preload">` + a hidden 1×1 `<img>` in `<body>` to keep it hot in cache, otherwise it flashes back to the system pointer during rapid DOM rebuilds.

Form-field detail to preserve: the autofill-kill CSS block (`-webkit-box-shadow` inset + `-webkit-text-fill-color` + 9999s transition) in every page that has a form — without it Chrome/Safari paint inputs grey on autofill.

---

## The data layer — the seam to a real backend

**Everything that reads or writes state goes through `db.js`.** This is the only file the front-end touches for data. It exposes a global `window.TPLC` with four namespaces:

```js
TPLC.applications  // .all(), .add(rec), .update(id, patch), .byStatus(s), .counts(), .recent(days)
TPLC.lunches       // .all(), .add(rec), .between(s,e), .inLastDays(days)
TPLC.plans         // .all(), .get(id), .set(id, planKey), .catalog()
TPLC.session       // .get(), .isStaff(), .login(email, pass), .logout()
TPLC.metrics       // monthlyApplicationFlow(n), monthlyLunches(n), monthlyRecurringRevenue(n),
                   // currentMRR(), currentARR(), mrrDelta(), overallAcceptanceRate(), memberActivity()
TPLC.submitApplication(formData) → record   // called by Apply.html on submit
TPLC.resetAll()                              // demo helper, regenerates seed data
```

**Migration path**: keep the public signature, swap the bodies for `fetch()` calls. The front-end will not change.

Record shapes (preserve these field names — the UI keys off them):

```js
// Application
{
  id, status: 'pending'|'accepted'|'waitlist'|'declined',
  appliedAt: ISO, decidedAt: ISO|null,
  data: {
    firstName, lastName, email, countryCode, phone,
    dobDay, dobMonth, dobYear,
    city, cityIsOther,
    profession, employer,
    linkedin, instagram,
    refName, refRelation,
    why
  },
  refCode: 'LU-XXNN'
}

// Lunch
{ id, date: ISO, restaurant, neighborhood, capacity, host: memberId|null, attendees: [memberId] }

// Plan
{ [memberId]: 'standard' | 'patron' }
// catalog: standard €80/mo · patron €180/mo
```

Mock credentials: `staff@plc.com` / `lunch2026` (defined in `db.js` `STAFF`, **rotate before production**).

Seed data fires once on first load (~15 accepted members, ~24 mixed applications, ~70 lunches across 12 months). Controlled by `tplc_v1.seeded` localStorage key. Remove the seed call when wiring a real backend.

---

## What the front-end does

### Apply.html — 10 steps, hand-rolled wizard
Steps are an array (`STEPS`) of `{ key, name }`. Each key has a `step<Key>()` builder returning HTML and an `isStepValid()` branch. Order matters — the review screen's Edit buttons reference step indices, so if you reorder, fix the `rows[].step` array in `stepReview()`.

The "Why" step has a 300-char limit with a live counter (`#whyCount`). The "City" step is a custom dropdown (not a `<select>`) — Paris is the only live option, the rest are "soon"; "Other" opens a free-text field. The phone step has a country-code dropdown bound to `state.data.countryCode`.

Each prompt + help line is character-revealed (`runTypewriter`) on step enter.

### Staff.html — left-rail dashboard
Pages: **Overview, Applications, Members, Lunches, Data**. Routing is `state.page` + class toggles; no real router. Each page renders into its own `<section class="page" data-page="...">`.

The **Data** page draws four hand-coded SVG charts (no chart lib): paired bar chart (applications applied vs accepted), single-line acceptance-rate chart, MRR area+line chart, lunches bar+attendee-line chart. Plus a KPI grid (MRR / ARR / acceptance rate / lunches 30d) and a "Most active / Least active" ranked list. All driven by `TPLC.metrics`.

Member activity ranking uses `lunches.all().forEach(l => l.attendees)` — once you have real lunches, this is automatic.

Drawer (right-side) opens on any row click, shows full profile, has **Accept / Waitlist / Decline** actions that write back through `applications.update()` and re-render.

### Sign In.html, The Paris Lunchers Club.html
Mostly visual. Sign In has a rotating italic topic word ("politics → finance → love → friendship…", 1.3s interval) and a passphrase input that doesn't actually authenticate yet — wire to the same real auth endpoint as Staff.

---

## What you need to build

### Tier 1 — make it real
1. **Real backend**: replace `db.js` with API calls. Postgres for `applications`, `lunches`, `members`/`plans`. Same field names. Endpoints suggested:
   - `POST /applications` — public, accepts the Apply.html payload, returns `{ refCode }`.
   - `GET/PATCH /applications` and `/applications/:id` — staff-only.
   - `GET /lunches`, `POST /lunches`, `GET /members`, etc.
   - `GET /metrics/overview`, `GET /metrics/data` — server computes the bucket aggregates the front-end currently does client-side.
2. **Real auth** for staff: email + password is fine for a small team. Replace the hardcoded `STAFF` constant. Currently session is a single localStorage flag — swap for a real session cookie / JWT.
3. **Email + phone uniqueness** at submit time. Right now there's nothing stopping duplicate applications.
4. **Confirmation emails**: applicant gets a "received" email with their `refCode`; staff get a "new application" digest. Hook into Postmark / Resend.

### Tier 2 — finish the member side
5. **Member Sign In** is currently theatre. Decide the model — magic link is probably right for this audience.
6. **Member portal**: once signed in, where do they go? Upcoming lunches, RSVP, past lunches, billing. Not yet designed — talk to the founder first.
7. **Lunch booking flow**: staff creates lunches (Lunches page is read-only now), members RSVP, capacity caps automatically. The data model supports this.

### Tier 3 — operational
8. **Stripe** for membership billing. Standard €80/mo, Patron €180/mo. MRR/ARR charts already exist and will become accurate the moment the plan/billing data is real.
9. **Analytics** beyond what's on the Data page (cohort retention, time-to-lunch after acceptance, referrer effectiveness).
10. **Internationalisation**: copy is bilingual leaning English-with-French-flourishes. If they expand to other cities (Londres, Madrid, Munich, Bordeaux, Brussels — all flagged "soon" in the city dropdown), add a proper i18n layer.

### Tier 4 — production hygiene
11. **Build pipeline**: the prototype is hand-written static HTML. Decide if you stay static (Astro, plain HTML + a thin server) or React-ify. Either is fine — the UI is small.
12. **Remove tweaks-panel.jsx** in prod builds (it's a design-time tool).
13. **Bot protection** on Apply.html — hCaptcha or Cloudflare Turnstile. Currently nothing.

---

## Conventions worth keeping
- **Em-dashes are banned** from user-facing copy (`—`). They were scrubbed for being too "AI-like". Stick with commas or periods.
- The **fork cursor** is the brand. Don't lose it. Don't change the hotspot (`32 4`).
- Tracked-caps eyebrows (10–11px, `letter-spacing: 0.22em+`) above big headlines is the editorial signature.
- Status pills (`accepted` `waitlist` `pending` `declined`) use ALL CAPS, narrow padding, color-mixed backgrounds. Don't invent new statuses without updating the CSS color tokens.
- All forms have `autocomplete="off"` on the form and proper `autocomplete` per-field. Preserve.
- Speaker-notes pattern isn't used (this isn't a deck). Ignore any leftover hooks.

---

## Quick local check before you start
1. Open `The Paris Lunchers Club.html` — landing renders, fork cursor everywhere.
2. Click Apply (or footer → Apply). Submit a fake application end-to-end.
3. Footer → Staff. Log in `staff@plc.com` / `lunch2026`.
4. Confirm your test application appears at the top of the Applications table with status `pending`.
5. Click Data in the left rail. Confirm KPIs and all four charts render.

If lunches show 0 in the Data page, you have stale localStorage from before the lunches model existed — click **Reset demo** in the top right of the workspace once.
