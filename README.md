# Fit and Proper Assessment

A portal for fit and proper assessments: an applicant answers 15 questions and attaches evidence,
the Data Authentication API checks each answer against its document, a reviewer rules on anything
it could not authenticate, and the case is scored and decided.

## Repository layout

```
frontend/    React + Vite app: the applicant and reviewer portals. Talks only to the backend's /api.
backend/     Django + PostgreSQL API: accounts, assessments, forms, documents, the case workflow,
             and the only connection to the Data Authentication API.
test-data/   Synthetic applicants: submission payloads, evidence documents, expected engine
             responses, and the scoring and test-set workbooks. seed_demo loads the five demo
             applicants from here.
```

## How a case flows

```
Applicant (frontend)               Backend + engine                         Reviewer (frontend)
────────────────────               ────────────────                         ───────────────────
Start an application, or open                                              Or opens one for an
one the reviewer opened ◀─────────────────────────────────────────────────── applicant
Fill 15 questions + attach evidence
Review and submit ───────────────▶ Engine authenticates each answer
                                   against its document, analyses the CV
                                   Clear → engine scores it ──────────────▶ Accept or reject the case
                                   Flags → ───────────────────────────────▶ Rule on every flagged answer
Resubmit the rejected evidence ◀──────────────────────────────────────────── any rejected → back to applicant
                                   all accepted → scored by the backend ──▶ Accept or reject the case
See the decision, remarks and score ◀──────────────────────────────────────
```

## Running it

Start the database and backend first ([backend/README.md](backend/README.md)), then:

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Signing in, the app's layout and where things go are in [frontend/README.md](frontend/README.md);
the API, workflow, security rules and storage are in [backend/README.md](backend/README.md); the
test data is described in [test-data/README.md](test-data/README.md).
