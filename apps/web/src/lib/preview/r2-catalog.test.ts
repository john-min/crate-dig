import { describe, expect, it } from "vitest";
import {
  PREVIEW_R2_PREFIX,
  isAllowedPreviewObjectKey,
  parsePreviewTrack,
  previewTrackIdForKey,
} from "./r2-catalog";

describe("preview R2 catalog", () => {
  it("allows demo/ and libraries/demo/ prefixes only", () => {
    expect(PREVIEW_R2_PREFIX).toBe("demo/");
    expect(isAllowedPreviewObjectKey("demo/originals/a.mp3")).toBe(true);
    expect(isAllowedPreviewObjectKey("libraries/demo/originals/a.mp3")).toBe(true);
    expect(isAllowedPreviewObjectKey("other/a.mp3")).toBe(false);
    expect(isAllowedPreviewObjectKey("demo/../secret.mp3")).toBe(false);
    expect(
      isAllowedPreviewObjectKey(
        "demo/originals/Contents/Fred again.. & BIA/UnknownAlbum/Fred again.. & BIA - ..FEISTY.mp3",
      ),
    ).toBe(true);
  });

  it("parses Rekordbox-style object keys into title and artist", () => {
    const parsed = parsePreviewTrack(
      "demo/originals/jeff-usb-2026-08-15/Contents/Acrobat/UnknownAlbum/Acrobat - That Beat.mp3",
    );
    expect(parsed).toMatchObject({
      artist: "Acrobat",
      title: "That Beat",
      objectKey:
        "demo/originals/jeff-usb-2026-08-15/Contents/Acrobat/UnknownAlbum/Acrobat - That Beat.mp3",
    });
    expect(parsed?.id).toBe(
      previewTrackIdForKey(
        "demo/originals/jeff-usb-2026-08-15/Contents/Acrobat/UnknownAlbum/Acrobat - That Beat.mp3",
      ),
    );
    expect(parsePreviewTrack("demo/originals/notes.json")).toBeNull();
  });
});
