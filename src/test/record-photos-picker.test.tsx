import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoDraft } from "@/lib/api/dentalRecords";

// jsdom can't decode a picture; the shrunk photo is what the form keeps.
vi.mock("@/lib/shrinkPhoto", () => ({ shrinkPhoto: vi.fn(async (f: File) => `data:image/jpeg;base64,${f.name.replace(/\W/g, "")}`) }));
vi.mock("@/components/ui/dropdown-menu", () => import("./plainDropdown"));

import { PhotoEditor } from "@/components/RecordPhotos";

const original = window.matchMedia;
function device(touch: boolean) {
  window.matchMedia = ((query: string) => ({ ...original(query), matches: touch && query === "(pointer: coarse)" })) as typeof window.matchMedia;
}
afterEach(() => { cleanup(); window.matchMedia = original; vi.restoreAllMocks(); });

/** Which of the two hidden file inputs a tap opened. */
function opened() {
  const clicked: string[] = [];
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    clicked.push(this.dataset.testid ?? "");
  });
  return clicked;
}

describe("where a photo comes from", () => {
  it("asks on a phone: the camera straight away, or the album", async () => {
    device(true);
    const clicked = opened();
    let photos: PhotoDraft[] = [];
    const { rerender } = render(<PhotoEditor photos={photos} onChange={(p) => { photos = p; }} />);

    fireEvent.click(screen.getByRole("button", { name: /Add After Photo/ }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual(["Take Photo", "Choose from Album"]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Take Photo/ }));
    expect(clicked).toEqual(["photo-camera"]);

    // The camera opens for the back-facing lens, one shot at a time; the album takes several.
    const camera = screen.getByTestId("photo-camera");
    expect(camera).toHaveAttribute("capture", "environment");
    expect(camera).not.toHaveAttribute("multiple");
    expect(screen.getByTestId("photo-album")).toHaveAttribute("multiple");

    fireEvent.change(camera, { target: { files: [new File(["x"], "shot.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(photos).toEqual([{ kind: "after", label: null, image: "data:image/jpeg;base64,shotjpg" }]));
    rerender(<PhotoEditor photos={photos} onChange={(p) => { photos = p; }} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Before Photo/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Choose from Album/ }));
    expect(clicked).toEqual(["photo-camera", "photo-album"]);
  });

  it("goes straight to the files on a PC, which has no camera to offer", () => {
    device(false);
    const clicked = opened();
    render(<PhotoEditor photos={[]} onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Before Photo/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(clicked).toEqual(["photo-album"]);
  });
});
