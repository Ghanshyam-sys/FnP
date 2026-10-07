import { HashRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AssessmentProvider } from "./state/AssessmentContext";
import AppShell from "./components/AppShell";
import ApplicantRoute from "./components/ApplicantRoute";
import ReviewerRoute from "./components/ReviewerRoute";
import LoginPage from "./pages/LoginPage";
import AssessmentsPage from "./pages/AssessmentsPage";
import ApplyPage from "./pages/ApplyPage";
import ReviewPage from "./pages/ReviewPage";
import StatusPage from "./pages/StatusPage";
import AuthenticationPage from "./pages/AuthenticationPage";
import ResultPage from "./pages/ResultPage";
import ReviewerQueuePage from "./pages/ReviewerQueuePage";
import ReviewerAuthenticationPage from "./pages/ReviewerAuthenticationPage";
import ReviewerResultPage from "./pages/ReviewerResultPage";
import QuestionConfigPage from "./pages/QuestionConfigPage";
import { seedDemoCases } from "./state/seedCases";
import { ROUTE_PATTERNS } from "./routes";
import "./styles/app.css";

// The demo queue is seeded once per browser, before anything reads a case.
seedDemoCases();

const applicant = (page: ReactNode) => <ApplicantRoute>{page}</ApplicantRoute>;
const reviewer = (page: ReactNode) => <ReviewerRoute>{page}</ReviewerRoute>;

export default function App() {
  return (
    <AssessmentProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path={ROUTE_PATTERNS.login} element={<LoginPage />} />
            <Route path={ROUTE_PATTERNS.assessments} element={<AssessmentsPage />} />

            <Route path={ROUTE_PATTERNS.apply} element={applicant(<ApplyPage />)} />
            <Route path={ROUTE_PATTERNS.applyReview} element={applicant(<ReviewPage />)} />
            <Route path={ROUTE_PATTERNS.applyStatus} element={applicant(<StatusPage />)} />
            <Route
              path={ROUTE_PATTERNS.applyAuthentication}
              element={applicant(<AuthenticationPage />)}
            />
            <Route path={ROUTE_PATTERNS.applyResult} element={applicant(<ResultPage />)} />

            <Route path={ROUTE_PATTERNS.reviewer} element={reviewer(<ReviewerQueuePage />)} />
            <Route
              path={ROUTE_PATTERNS.reviewerQuestions}
              element={reviewer(<QuestionConfigPage />)}
            />
            <Route
              path={ROUTE_PATTERNS.reviewerAuthentication}
              element={reviewer(<ReviewerAuthenticationPage />)}
            />
            <Route
              path={ROUTE_PATTERNS.reviewerResult}
              element={reviewer(<ReviewerResultPage />)}
            />
          </Routes>
        </AppShell>
      </HashRouter>
    </AssessmentProvider>
  );
}
