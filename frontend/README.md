# Fit and Proper Assessment — proof of concept

A front-end demo of the fit and proper assessment flow: an applicant fills in the 15-question
form and attaches evidence, an authentication engine checks the evidence, a reviewer rules on
anything it flags, and the case is scored and decided.

There is no backend yet. The authentication engine, the CV analysis and the final assessment
narrative are **stub data** that reproduce what the backend is expected to return for the five
test applicants. All case state lives in the browser's `localStorage`.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |
| `npm test` | Vitest: pins the demo's engine outputs and the case-stage timeline |

## Demo logins

There are no passwords. Sign-in lasts for the browser tab.

| Sign in as | Sees | Seeded state |
|---|---|---|
| `j.amutenya@example.na` | APP001 | Clean, scored, accepted |
| `p.shivute@example.na` | APP002 | Clean, scored, waiting on the reviewer's decision |
| `e.haufiku@example.na` | APP003 | Q3 and PC19 flagged, waiting on the reviewer |
| `m.vanwyk@example.na` | APP004 | PC1 flagged and rejected, waiting on the applicant to resubmit |
| `m.kaapanda@example.na` | APP005 | Held in "Scoring in progress" |
| `Admin` | Reviewer portal | All five |

The seed is written once per browser. To reset the demo, clear the site's local storage.

### Adding an applicant

Sign in as `Admin` and choose **New assessment** in the queue. Enter the applicant's name and
email, the entity, the position and the parent application reference. The applicant then signs
in with that email, starts the assessment from a blank form and submits it as usual.

Assessments created this way are stored in the browser like the rest of the demo, so they exist
only in that browser. While the applicant has not submitted, the reviewer can remove one from
its case page. The five built-in assessments cannot be removed. Built-in demo data is in
`src/data/assignments.ts`; every lookup goes through `src/state/assignmentStore.ts`, which
merges in the created ones.

## Layout

```
src/
  routes.ts     Every route pattern and a builder per route; links never hand-build paths
  pages/        One component per route (applicant /apply/*, reviewer /reviewer/*)
  components/   Shared UI: route gates (ApplicantRoute, ReviewerRoute), PageHeader,
                EmptyState, Modal, ConfidenceBar/CheckItem, AnswerTag, the report views
  domain/       Pure logic: the question catalogue, evidence rules and options,
                authentication checks, scoring, bands
  state/        localStorage-backed stores (drafts, cases, reviewer config), the session
                context, useCaseView (what every case page loads), review-state helpers
  data/
    assignments.ts   The demo assessments and who they belong to
    fixtures.ts      Loads the test-set form payloads
    stubs/           Stand-ins for backend responses (authentication results, CV analysis)
    assessments/     Final assessment narrative (APP001 only)
    testset/         Copy of the test set's form payloads the demo is pinned to
  styles/
    base/global.css  Design tokens (colours, radii, shadows, text sizes) and element defaults
    app.css          Imports every other stylesheet in cascade order — keep that order
    base/, components/, pages/   One stylesheet per area
  utils/        Formatting helpers
public/evidence/     The evidence PDFs the review pages link to
```

### Where things go

- **A question's rules** (weight, polarity, knock-out, when evidence is required, N/A,
  supporting documents, which checks run) all live on its entry in `domain/questions.ts`.
  The document dropdown for each question is in `domain/evidenceOptions.ts`.
- **An applicant detail** (a field in the "Applicant details" card): add the key to
  `ApplicantDetails` in `domain/types.ts` and an entry to `APPLICANT_FIELDS` in
  `domain/applicantDetails.ts`. The form, the review summary and the reviewer's card all render
  from that list. Demo values for the five seeded applicants are in `data/stubs/applicantDetails.ts`.
- **A new route**: add the pattern and a builder to `routes.ts`, register it in `App.tsx`
  behind `ApplicantRoute` or `ReviewerRoute`.
- **A new case page**: start from `useCaseView(id)`, which returns the assessment, its form,
  the engine outcome and the flags. Read the stage with `stageFor` yourself, with or without
  `useStageTicker`, depending on whether the page should update while a stage is running.
- **Styles**: add rules to the stylesheet for that area and use the tokens in
  `styles/base/global.css` rather than new literal colours or sizes.

## Replacing the stubs with a backend

The places that stand in for the service are kept together so they can be swapped one at a time:

- `data/stubs/authenticationOverrides.ts`: the check results that differ from a clean pass.
  Used by `domain/authentication.ts`.
- `data/stubs/cvAnalysis.ts`: per-applicant CV findings. Used by `domain/cvVerification.ts`.
- `data/assessments/APP001.json`: the narrative assessment. Used by `domain/finalAssessment.ts`.
- `state/caseStore.ts`: case stages are simulated from timestamps (`AUTH_MS`, `SCORING_MS`).

`src/domain/demoBehaviour.test.ts` snapshots what the demo produces for every applicant. If a
change alters those outputs on purpose, update the snapshots with `npx vitest run -u` and review
the diff.

## Test data

The canonical test set is `../test-data/`, shared with the backend. The app keeps its own copy
of the form payloads and evidence so the demo stays stable while the test set evolves. The test
set has since moved the CV block to a `profile_review` structure and added APP006, neither of
which the demo uses yet.
