# Backend

Not started. The frontend currently runs on stub data that stands in for every call this
service will make, so the demo works end to end without it. This folder holds what the backend
has to honour until the service itself exists.

## What the backend has to provide

Each row is something the frontend fakes today. The stub column is where to look for the exact
data the UI expects; the test data column is the ground truth to build and test against.

| Responsibility | Stubbed in the frontend by | Expected output in `../test-data/` |
|---|---|---|
| **Authenticate a submission**: read each attached document and run the checks for its question, returning a verdict and confidence per check | `frontend/src/data/stubs/authenticationOverrides.ts` with `frontend/src/domain/authentication.ts` | `Expected_Auth_Response/APP00N_expected_response.json` |
| **Analyse the CV** against the authenticated qualification, experience and directorships | `frontend/src/data/stubs/cvAnalysis.ts` with `frontend/src/domain/cvVerification.ts` | The `cvVerification` block of the same expected responses |
| **Write the final assessment**: determination, concerns, conditions, strengths | `frontend/src/data/assessments/APP001.json` (APP001 only) | `Expected_Assessment_Summary/` |
| **Hold case state**: submission, the reviewer's rulings and decision, resubmissions | `frontend/src/state/caseStore.ts` (browser `localStorage`, stages simulated from timestamps) | n/a |
| **Create and remove assessments**: the reviewer opens an assessment against an application; the applicant sees it at sign-in | `frontend/src/state/assignmentStore.ts` (browser `localStorage`) | n/a |

Scoring runs in the frontend (`frontend/src/domain/engine.ts`, from
`test-data/fnp_scoring_model_15q_v2.xlsx`) and needs no backend unless the team decides to move it.

## Inputs

- **Submission payload**: one per applicant in `../test-data/form_data/APP00N.json`, the answers
  plus the evidence each answer points at. The frontend's applicant details section adds three
  keys to its `applicant` block that the test-set files do not have yet:

  | Key | Type | Required | Notes |
  |---|---|---|---|
  | `full_name` | string | yes | From the assessment record; the filer cannot change it |
  | `proposed_role` | string | yes | From the parent application |
  | `date_of_birth` | string, `YYYY-MM-DD` | yes | A real date in the past, after 1900 |
  | `town` | string | yes | Town of residence |
  | `nationality` | string | yes | **New** |
  | `national_id_number` | string | yes | **New**; 4–20 letters or digits |
  | `phone` | string | no | **New**; digits, spaces, `+` and `-` |

  "Required" is what the form asks for. Submission is not blocked on it, so the service should
  expect any of these to arrive empty and report it rather than reject the submission. The
  rules live in `frontend/src/domain/applicantDetails.ts`.
- **Evidence documents**: `../test-data/evidence/APP00N/`.
- **Engine prompts**: `../test-data/engine_prompts.json`.

## Creating an assessment

The reviewer's "New assessment" form sends what the service needs to open one:

| Field | Type | Rule |
|---|---|---|
| `applicantName` | string | required |
| `email` | string | required, valid email, stored lower-case; the applicant signs in with it |
| `entity` | string | required |
| `position` | string | required |
| `reference` | string | required; the parent application. Unique across assessments, compared case-insensitively |
| `initiatedOn` | string, `YYYY-MM-DD` | required, not in the future |

The frontend fills in the rest: `departmentKey` is always `banking` (the reviewer portal's only
department), and the id is `FNP-<year>-<serial>`, with serials never reused even after removal.
One email may hold several assessments as long as their references differ.

Removal is allowed only for assessments the reviewer created, and only before the applicant
submits; it also deletes the applicant's draft. The rules are in
`frontend/src/domain/newAssessment.ts` and `frontend/src/state/assignmentStore.ts`.

## API contract

`api-contract/authentication-response.example.json` is the agreed shape of the authentication
response, using APP004 (whose clearance certificate contradicts their answer to PC1).

It lines up with the frontend's `AuthenticationOutcome` type in `frontend/src/domain/types.ts`
almost field for field: `sections`, each question, each check and `cvVerification` have the same
names and shapes. Two differences need a small adapter when the stub is swapped out:

- The totals sit under `summary` here (`summary.isClean`, `summary.overallConfidence`,
  `summary.checksRun`), but at the top level in the frontend type.
- The response also carries `parentApplication`, `applicant`, `status`, `submittedAt`,
  `authenticatedAt`, `engineVersion` and `summary.questionsWithIssues`, which the frontend does
  not read today.

The example's parent application (Windhoek Commercial Bank, Chief Financial Officer) differs
from the demo's data for the same applicant (Oshakati Microfinance Bank, Executive Director).
The structure is the contract; the values are illustrative.

## When work starts

Put the service code in this folder, document how to run it here, and add each endpoint's
request and response examples under `api-contract/`.
