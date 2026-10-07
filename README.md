# Fit and Proper Assessment

A portal for fit and proper assessments: an applicant answers 15 questions and attaches evidence,
an engine authenticates each answer against its document, a reviewer rules on anything it could
not authenticate, and the case is scored and decided.

## Repository layout

```
frontend/    React + Vite app: both portals (applicant and reviewer). Runs today on stub data.
backend/     The service that will authenticate evidence and hold case state. Not started;
             holds the API contract the frontend is built against.
test-data/   Synthetic applicants shared by both sides: submission payloads, evidence documents,
             expected engine responses, and the scoring and test-set workbooks.
```

## How a case flows

```
Applicant (frontend)                 Engine (backend — stubbed today)        Reviewer (frontend)
────────────────────                 ────────────────────────────────        ───────────────────
Fill 15 questions + attach evidence
Review and submit ─────────────────▶ Authenticate each answer
                                     against its document
                                     Analyse the CV
                    ◀───────────────  Flags any answer it could not
                                     authenticate ─────────────────────────▶ Accept or reject each flag
Resubmit evidence if rejected ◀────────────────────────────────────────────── (rejected → back to applicant)
                                     Score (runs in the frontend today)
                                     Write the final assessment ──────────▶ Accept or reject the case
See the decision and the reports ◀───────────────────────────────────────────
```

Until the backend exists, everything in the middle column is answered by the stub data listed
in [backend/README.md](backend/README.md), so the demo runs end to end in the browser.

## Running the demo

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Demo logins and the app's own layout are in [frontend/README.md](frontend/README.md). The test
data is described in [test-data/README.md](test-data/README.md).
