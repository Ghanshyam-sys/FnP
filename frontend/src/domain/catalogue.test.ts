import { describe, expect, it } from "vitest";
import { customCode, customName, documentLabel, fileProblem, sizeHint, withFormOptions } from "./catalogue";
import type { Catalogue, Form } from "../api/types";

const MB = 1024 * 1024;
const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe("fileProblem", () => {
  it("accepts a file in an allowed format within the limit", () => {
    expect(fileProblem(file("court-order.PDF", 10), ["pdf"], 15 * MB)).toBeNull();
    expect(fileProblem(file("scan.jpeg", 10), ["pdf", "jpg"], 15 * MB)).toBeNull();
  });

  it("refuses another format, a file over the limit and an empty file, as the server words it", () => {
    expect(fileProblem(file("notes.docx", 10), ["pdf", "png"], 15 * MB)).toBe("This question accepts PDF, PNG files.");
    expect(fileProblem(file("noextension", 10), ["pdf"], 15 * MB)).toBe("This question accepts PDF files.");
    expect(fileProblem(file("big.pdf", 2 * MB + 1), ["pdf"], 2 * MB)).toBe("Files must be 2 MB or smaller.");
    expect(fileProblem(file("empty.pdf", 0), ["pdf"], 15 * MB)).toBe("The file is empty.");
  });
});

describe("sizeHint", () => {
  it("names the limit in MB", () => {
    expect(sizeHint(15 * MB)).toBe("up to 15 MB");
  });
});

describe("withFormOptions", () => {
  const option = (code: string) => ({ code, label: code, note: "", doc_type: code.toLowerCase(), display: code });
  const catalogue = { evidenceOptions: { A1: [option("PASSPORT")], N1: [option("NEW_TYPE")] } } as unknown as Catalogue;
  const answer = (qid: string, evidenceOptions: ReturnType<typeof option>[] | null) =>
    ({ qid, evidenceOptions }) as unknown as Form["answers"][number];

  it("gives a question added here the document types of the form's own version", () => {
    const form = { answers: [answer("A1", null), answer("N1", [option("OLD_TYPE")])] } as unknown as Form;
    const seen = withFormOptions(catalogue, form);
    expect(seen.evidenceOptions.N1.map((o) => o.code)).toEqual(["OLD_TYPE"]);
    expect(seen.evidenceOptions.A1.map((o) => o.code)).toEqual(["PASSPORT"]);
  });

  it("leaves the catalogue as it is when no question has its own", () => {
    const form = { answers: [answer("A1", null)] } as unknown as Form;
    expect(withFormOptions(catalogue, form)).toBe(catalogue);
  });
});

describe("document types named in the question configuration", () => {
  it("carry the name in their code, and the engine's codes do not", () => {
    expect(customName(customCode("Professional licence"))).toBe("Professional licence");
    expect(customName("PASSPORT")).toBeNull();
    expect(customName("CUSTOM:")).toBeNull();
  });

  it("are labelled by their name once attached", () => {
    const empty = { evidenceOptions: {} } as unknown as Catalogue;
    const file = { option_code: customCode("Board minutes"), doc_type: "other", description: "Board minutes" };
    expect(documentLabel(empty, file as never, "N1")).toBe("Board minutes");
  });
});
