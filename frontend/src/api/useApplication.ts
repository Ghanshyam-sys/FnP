import { useAssessment, useCatalogue, useForm } from "./queries";
import { toApplicationForm } from "./adapt";
import type { Assessment, Catalogue, Form } from "./types";
import type { ApplicationForm } from "../domain/types";

export type ApplicationData =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "ready"; assessment: Assessment; catalogue: Catalogue; raw: Form; form: ApplicationForm };

/** What the form and review pages start from: the assessment, the catalogue and the form. */
export function useApplication(id: string): ApplicationData {
  const assessment = useAssessment(id);
  const catalogue = useCatalogue();
  const form = useForm(id);
  // A failed background refresh keeps what is on screen; only a page with nothing to show yet
  // turns into the error page.
  const failed = [assessment, catalogue, form].find((q) => q.isError && q.data === undefined);
  if (failed) {
    return {
      status: "error",
      error: failed.error,
      retry: () => [assessment, catalogue, form].forEach((q) => q.isError && q.refetch()),
    };
  }
  if (!assessment.data || !catalogue.data || !form.data) return { status: "loading" };
  return {
    status: "ready",
    assessment: assessment.data,
    catalogue: catalogue.data,
    raw: form.data,
    form: toApplicationForm(form.data, catalogue.data, assessment.data),
  };
}
