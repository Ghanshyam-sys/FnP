# Fit and Proper Assessment — frontend

The browser app for the fit and proper assessment flow: an applicant fills in the 15-question
form and attaches evidence, the authentication engine checks the evidence, a reviewer rules on
anything it flags, and the case is scored and decided.

All data comes from the backend in `../backend` through `/api`. The frontend stores nothing of
its own: no `localStorage`, no demo data.

## Running it

Start the backend first (see `../backend/README.md`: database, then `runserver 127.0.0.1:8001`).

```sh
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend
```

The proxy target defaults to `http://127.0.0.1:8001`; set `FNP_API_URL` to use another.

Pages have clean URLs (`/reviewer/FNP-2026-0412/authentication`, no `#`). Whatever serves the
production build must therefore answer every path outside `/api` with `index.html`, so a page can
be reloaded or bookmarked; on nginx that is `try_files $uri /index.html;`, with `/api` proxied to
Django. The dev server and `npm run preview` already do this. Old `/#/...` links still open the
right page: the app moves the path out of the `#` on load.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |
| `npm test` | Vitest: the applicant-detail and new-assessment rules |

## Signing in

Sign-in is the backend's development rule, with no passwords: any email signs in as that
applicant, and `Admin` signs in as the reviewer. The session is a cookie held by the backend.

After `seed_demo` the five demo applicants are `j.amutenya@`, `p.shivute@`, `e.haufiku@`,
`m.vanwyk@` and `m.kaapanda@example.na`, each with a filled-in, unsubmitted form. Submitting
one sends it to the authentication engine (a billed run).

An application can start in two ways:

- **The applicant starts it:** they sign in with any email, choose **Start a new application**,
  pick the department and enter the application details, then fill in the form. They can have up
  to three unsubmitted applications, and can remove one they started before submitting it.
- **The reviewer opens it:** sign in as `Admin` and choose **New assessment** in the queue; the
  applicant then signs in with the email entered there.

Either way, until it is submitted the reviewer sees the draft read-only and can remove it. The
reviewer's queue covers all departments and can be filtered to one.

## Layout

```
src/
  api/          The backend: client.ts (fetch, CSRF, ApiError), types.ts (response shapes),
                queries.ts (one TanStack Query hook per resource and change), adapt.ts (API
                shapes into the ones the report components render), useApplication and
                useCaseView (what the form pages and the case pages load)
  routes.ts     Every route pattern and a builder per route; links never hand-build paths
  pages/        One component per route (applicant /apply/*, reviewer /reviewer/*)
  components/   Shared UI: route gates (ApplicantRoute, ReviewerRoute), PageHeader, LoadState,
                EmptyState, Modal, EvidenceBlock, the report views
  domain/       Pure rules: catalogue helpers, evidence gaps, applicant details, new-assessment
                validation, risk bands, sections' display names
  state/        caseLabels.ts: what each case stage is called and how the queue orders it
  styles/
    base/global.css  Design tokens (colours, radii, shadows, text sizes) and element defaults
    app.css          Imports every other stylesheet in cascade order — keep that order
    base/, components/, pages/   One stylesheet per area
  utils/        Formatting helpers
```

### Where things go

- **Server data**: add the response type to `api/types.ts` and a hook to `api/queries.ts`. A
  change that answers with the updated resource writes it into the cache rather than refetching.
  Pages show `<Loading/>` and `<LoadError/>` (`components/LoadState.tsx`) while a query has no
  data.
- **A question's rules** (weight, when evidence is required, answer options, file types, which
  checks run) come from the backend's catalogue (`GET /api/catalogue`). Reviewers change answer
  options and attachment rules on the question settings page; weights belong to the scoring
  model and are read-only.
- **An applicant detail**: add it to the backend (`cases/models.py`, `cases/validation.py`, `cases/views/form.py`), then to
  `ApplicantDetails` in `domain/types.ts`, `APPLICANT_FIELDS` in `domain/applicantDetails.ts`
  and the mapping in `api/adapt.ts`. The form, the review summary and the reviewer's card all
  render from that list.
- **A new route**: add the pattern and a builder to `routes.ts`, register it in `App.tsx`
  behind `ApplicantRoute` or `ReviewerRoute`.
- **A new case page**: start from `useCaseView(id)`, which returns the assessment, the case, the
  engine report and the score, and refreshes itself while the engine is working.
- **Styles**: add rules to the stylesheet for that area and use the tokens in
  `styles/base/global.css` rather than new literal colours or sizes.
