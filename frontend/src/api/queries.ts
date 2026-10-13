/**
 * Server state, through TanStack Query: one cache entry per resource, refreshed after every change
 * that affects it. A change's response is the updated resource, so it is written straight into the
 * cache instead of being fetched again.
 */
import { useCallback, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, api } from "./client";
import type {
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  Assessment,
  Case,
  Catalogue,
  Department,
  EvidenceItem,
  Form,
  Page,
  QuestionnaireSettings,
  QuestionnaireVersion,
  Role,
  SessionUser,
  Stage,
  Verdict,
} from "./types";
import type { Answer, EvidenceRole } from "../domain/types";
import type { NewAssessmentInput } from "../domain/newAssessment";

export const keys = {
  session: ["session"] as const,
  /** Set when the backend reported the session had ended; the sign-in page says so. */
  sessionEnded: ["session-ended"] as const,
  catalogue: ["catalogue"] as const,
  questionnaire: ["questionnaire"] as const,
  departments: ["departments"] as const,
  assessments: ["assessments"] as const,
  assessment: (id: string) => ["assessment", id] as const,
  form: (id: string) => ["form", id] as const,
  case: (id: string) => ["case", id] as const,
  admin: ["admin"] as const,
};

/** Stages the engine is still working through; a case page checks back while it is in one. */
const RUNNING: Stage[] = ["AUTH_RUNNING", "SCORING"];
const POLL_MS = 3000;

// ---- Session ----------------------------------------------------------------------------------

/**
 * Who is signed in. Checked again whenever the tab comes back into focus: signing in as someone
 * else in another tab changes the session for every tab, and this tab must follow rather than
 * keep showing (and acting as) the previous user.
 */
export function useSession() {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      const { user } = await api<{ user: SessionUser | null }>("GET", "/session");
      const previous = client.getQueryData<SessionUser | null>(keys.session);
      // Someone else now: nothing cached for the previous user may be shown to them.
      if (previous !== undefined && previous?.email !== user?.email) dropOtherUserData(client);
      return user;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: "always",
  });
}

function dropOtherUserData(client: QueryClient) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.session[0] });
  client.getMutationCache().clear();
}

/**
 * Switches the app to another signed-in user, or to nobody. Nothing cached for the previous user
 * may outlive the switch. The session entry is updated in place rather than dropped: the route
 * gates and the header are watching it, and would not notice a fresh entry.
 */
export function switchUser(client: QueryClient, user: SessionUser | null) {
  client.setQueryData(keys.session, user);
  dropOtherUserData(client);
}

export function useSignIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api<{ user: SessionUser }>("POST", "/session", { email }),
    onSuccess: ({ user }) => switchUser(client, user),
  });
}

export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("DELETE", "/session"),
    onSettled: () => switchUser(client, null),
  });
}

// ---- Catalogue and question settings ----------------------------------------------------------

export function useCatalogue() {
  return useQuery({
    queryKey: keys.catalogue,
    queryFn: () => api<Catalogue>("GET", "/catalogue"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useQuestionnaire() {
  return useQuery({ queryKey: keys.questionnaire, queryFn: () => api<QuestionnaireSettings>("GET", "/questionnaire") });
}

export type QuestionSettings = Record<string, { allowedAnswers: Answer[]; fileTypes: string[]; maxFiles: number }>;

/** Publishes settings edited from `version`; refused (409) if someone has published since. */
export function useSaveQuestionnaire() {
  const client = useQueryClient();
  const refresh = () => {
    client.invalidateQueries({ queryKey: keys.questionnaire });
    client.invalidateQueries({ queryKey: keys.catalogue });
  };
  return useMutation({
    mutationFn: (edit: { version: string; questions: QuestionSettings }) =>
      api<QuestionnaireVersion>("PUT", "/questionnaire", edit),
    onSuccess: (published) => {
      // The page moves onto the published version at once, so a follow-up save builds on it.
      client.setQueryData<QuestionnaireSettings>(keys.questionnaire, (old) => old && { ...old, current: published });
      refresh();
    },
    // Refused as out of date: load the settings now in force.
    onError: (error) => error instanceof ApiError && error.status === 409 && refresh(),
  });
}

// ---- Assessments ------------------------------------------------------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: keys.departments,
    queryFn: () => api<Department[]>("GET", "/departments"),
    staleTime: Infinity,
  });
}

/**
 * The applicant's own assessments, or the reviewer's queue, a page at a time. The reviewer can
 * narrow the queue to one department.
 */
export function useAssessments(department = "") {
  const { data: user } = useSession();
  return useInfiniteQuery({
    queryKey: [...keys.assessments, department],
    // Signed out, there is nothing to list (the page sends the user to sign in).
    enabled: Boolean(user),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (pageParam) params.set("cursor", pageParam);
      const query = params.toString();
      return api<Page<Assessment>>("GET", `/assessments${query ? `?${query}` : ""}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
    // Switching the department filter keeps the current list on screen until the new one arrives.
    placeholderData: (previous) => previous,
    // The queue reflects running engine jobs; refresh it while any listed case is still running.
    refetchInterval: (query) =>
      query.state.data?.pages.some((p) => p.results.some((a) => RUNNING.includes(a.stage))) ? POLL_MS : false,
  });
}

/** One assessment; pass undefined to skip (the hook must still be called unconditionally). */
export function useAssessment(id: string | undefined) {
  return useQuery({
    queryKey: keys.assessment(id ?? ""),
    queryFn: () => api<Assessment>("GET", `/assessments/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAssessment() {
  const client = useQueryClient();
  return useMutation({
    // The reviewer sends every field; an applicant sends neither email nor date (see newAssessmentFields).
    mutationFn: (input: Partial<NewAssessmentInput>) => api<Assessment>("POST", "/assessments", input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.assessments }),
  });
}

export function useRemoveAssessment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("DELETE", `/assessments/${id}`),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.assessment(id) });
      client.removeQueries({ queryKey: keys.case(id) });
      client.invalidateQueries({ queryKey: keys.assessments });
    },
  });
}

// ---- The applicant's form ---------------------------------------------------------------------

export function useForm(id: string) {
  return useQuery({ queryKey: keys.form(id), queryFn: () => api<Form>("GET", `/assessments/${id}/form`) });
}

export interface FormChanges {
  answers?: Record<string, Answer>;
  applicant?: Partial<Record<"dateOfBirth" | "town" | "nationality" | "nationalIdNumber" | "phone", string>>;
}

/** A save the server refused, and the change it carried. */
export interface SaveRefusal {
  error: unknown;
  changes: FormChanges;
}

/**
 * Saves answers and details. The change shows at once. Several saves can be waiting (one per field
 * left); they are sent one at a time, in the order they were made, so the server applies them in
 * that order and the last to finish carries the server's copy after all of them. Only that one
 * settles the form: with the server's copy if it saved, or by reloading it if it was refused.
 *
 * Every refusal is reported in `refusal`, not only the last: a later save that succeeds would
 * otherwise replace the refused change on screen without a word. It stays until the next change.
 * `save` also rejects with the refusal, for a caller that shows it against the field.
 */
export function useSaveForm(id: string) {
  const client = useQueryClient();
  const [refusal, setRefusal] = useState<SaveRefusal | null>(null);
  const mutationKey = [...keys.form(id), "save"];
  // The settling save itself still counts as in flight while its callbacks run; saves waiting
  // their turn count too.
  const isLastInFlight = () => client.isMutating({ mutationKey }) === 1;
  const { mutateAsync } = useMutation({
    mutationKey,
    scope: { id: mutationKey.join(":") },
    mutationFn: (changes: FormChanges) => api<Form>("PATCH", `/assessments/${id}/form`, changes),
    onMutate: async (changes) => {
      await client.cancelQueries({ queryKey: keys.form(id) });
      client.setQueryData<Form>(keys.form(id), (form) =>
        form && {
          ...form,
          applicant: { ...form.applicant, ...changes.applicant },
          answers: form.answers.map((a) => (changes.answers?.[a.qid] ? { ...a, value: changes.answers[a.qid] } : a)),
        }
      );
    },
    onSuccess: (form) => {
      if (isLastInFlight()) client.setQueryData(keys.form(id), form);
      client.invalidateQueries({ queryKey: keys.assessments });
    },
    onError: (error, changes) => {
      setRefusal({ error, changes });
      // A later save still to finish brings the server's copy, without the refused change.
      if (isLastInFlight()) client.invalidateQueries({ queryKey: keys.form(id) });
    },
  });
  const save = useCallback(
    (changes: FormChanges): Promise<Form> => {
      setRefusal(null);
      return mutateAsync(changes);
    },
    [mutateAsync]
  );
  return { save, refusal };
}

/** Starts a form over (before submission). Takes the assessment id when called. */
export function useResetForm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Form>("POST", `/assessments/${id}/form/reset`),
    onSuccess: (form, id) => {
      client.setQueryData(keys.form(id), form);
      client.invalidateQueries({ queryKey: keys.assessments });
    },
  });
}

export interface Upload {
  qid: string;
  optionCode: string;
  role: EvidenceRole;
  description?: string;
  file: File;
}

export function useUploadEvidence(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, ...fields }: Upload) => {
      const body = new FormData();
      body.append("file", file);
      for (const [name, value] of Object.entries(fields)) if (value) body.append(name, value);
      return api<EvidenceItem>("POST", `/assessments/${id}/evidence`, body);
    },
    onSuccess: () => refreshCaseData(client, id),
  });
}

export function useRemoveEvidence(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) => api<void>("DELETE", `/assessments/${id}/evidence/${evidenceId}`),
    // Refused (the case moved on in another tab) or failed: the list is reloaded either way, so
    // it shows what is really attached.
    onSettled: () => refreshCaseData(client, id),
  });
}

function refreshCaseData(client: QueryClient, id: string) {
  client.invalidateQueries({ queryKey: keys.form(id) });
  client.invalidateQueries({ queryKey: keys.case(id) });
}

// ---- The case ---------------------------------------------------------------------------------

/** The case, checked again every few seconds while the engine is still working on it. */
export function useCase(id: string) {
  return useQuery({
    queryKey: keys.case(id),
    queryFn: () => api<Case>("GET", `/assessments/${id}/case`),
    refetchInterval: (query) => (query.state.data && RUNNING.includes(query.state.data.stage) ? POLL_MS : false),
  });
}

/**
 * Every workflow step answers with the updated case, which also changes the assessment's stage.
 * A refused step usually means the case moved on (the other party acted), so it is refreshed then
 * too, and the page shows where it now stands.
 */
function useCaseStep<T>(id: string, step: (input: T) => Promise<Case>) {
  const client = useQueryClient();
  const refreshRelated = () => {
    client.invalidateQueries({ queryKey: keys.assessment(id) });
    client.invalidateQueries({ queryKey: keys.assessments });
    client.invalidateQueries({ queryKey: keys.form(id) });
  };
  return useMutation({
    mutationFn: step,
    onSuccess: (updated) => {
      client.setQueryData(keys.case(id), updated);
      refreshRelated();
    },
    onError: () => {
      client.invalidateQueries({ queryKey: keys.case(id) });
      refreshRelated();
    },
  });
}

export const useSubmit = (id: string) => useCaseStep(id, () => api<Case>("POST", `/assessments/${id}/submit`));
export const useResubmit = (id: string) => useCaseStep(id, () => api<Case>("POST", `/assessments/${id}/resubmit`));
export const useRetry = (id: string) => useCaseStep(id, () => api<Case>("POST", `/assessments/${id}/retry`));

export const useRule = (id: string) =>
  useCaseStep(id, ({ qid, verdict, comment }: { qid: string; verdict: Verdict; comment: string }) =>
    api<Case>("PUT", `/assessments/${id}/rulings/${qid}`, { verdict, comment })
  );

export const useUndoRuling = (id: string) =>
  useCaseStep(id, (qid: string) => api<Case>("DELETE", `/assessments/${id}/rulings/${qid}`));

export const useDecide = (id: string) =>
  useCaseStep(id, ({ verdict, remarks }: { verdict: Verdict; remarks: string }) =>
    api<Case>("POST", `/assessments/${id}/decision`, { verdict, remarks })
  );

// ---- The reviewer's admin panel ----------------------------------------------------------------

export function useAdminOverview() {
  return useQuery({
    queryKey: [...keys.admin, "overview"],
    queryFn: () => api<AdminOverview>("GET", "/admin/overview"),
  });
}

export interface AdminUserFilters {
  search: string;
  role: "" | Role;
  status: "" | "active" | "inactive";
}

/** Every account, newest first, a page at a time. */
export function useAdminUsers(filters: AdminUserFilters) {
  return useInfiniteQuery({
    queryKey: [...keys.admin, "users", filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.role) params.set("role", filters.role);
      if (filters.status) params.set("status", filters.status);
      if (pageParam) params.set("page", pageParam);
      const query = params.toString();
      return api<Page<AdminUserRow>>("GET", `/admin/users${query ? `?${query}` : ""}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
    // Typing in the search keeps the current list on screen until the new one arrives.
    placeholderData: (previous) => previous,
  });
}

export function useAdminUser(userId: number) {
  return useQuery({
    queryKey: [...keys.admin, "user", userId],
    queryFn: () => api<AdminUserDetail>("GET", `/admin/users/${userId}`),
    enabled: Number.isInteger(userId) && userId > 0,
  });
}
