import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ api: vi.fn(async () => ({})) }));

import { api } from "@/contexts/AuthContext";
import { savePhotos, type PhotoDraft } from "@/lib/api/dentalRecords";

const saved: PhotoDraft[] = [
  { id: "a", kind: "before", label: "Front", image: "data:image/jpeg;base64,A" },
  { id: "b", kind: "before", label: null, image: "data:image/jpeg;base64,B" },
  { id: "c", kind: "after", label: "Upper", image: "data:image/jpeg;base64,C" },
];

describe("saving a record's photos from Edit", () => {
  it("deletes the ones taken off, relabels the changed ones, uploads the new, and leaves the rest", async () => {
    await savePhotos("rec-1", [
      { ...saved[0], label: "Lower" },
      saved[2],
      { kind: "after", label: null, image: "data:image/jpeg;base64,D" },
    ], saved);

    expect(vi.mocked(api).mock.calls.map(([path, init]) => [path, init?.method, init?.body && JSON.parse(String(init.body))])).toEqual([
      ["/dental-records?photo=a", "PATCH", { label: "Lower" }],
      ["/dental-records?photo=b", "DELETE", undefined],
      ["/dental-records?photos=true", "POST", { recordId: "rec-1", kind: "after", label: null, image: "data:image/jpeg;base64,D" }],
    ]);
  });
});
