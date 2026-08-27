import { describe, expect, it } from "vitest";
import { presignAwsRequest, r2ObjectUrl, encodeS3Path } from "./signature";

const credentials = {
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "auto",
  service: "s3",
};

describe("R2 SigV4 presign", () => {
  it("builds a deterministic signed PUT that does not use the Next origin as the upload target", () => {
    const url = r2ObjectUrl(
      "https://abc.r2.cloudflarestorage.com",
      "crate-dig-audio-dev",
      "libraries/lib-1/originals/up-1/track name.wav",
    );
    const signed = presignAwsRequest(
      {
        method: "PUT",
        url,
        headers: { "Content-Type": "audio/wav" },
        expiresSeconds: 900,
        amzDate: "20260826T180000Z",
      },
      credentials,
    );
    const parsed = new URL(signed.url);
    expect(parsed.origin).toBe("https://abc.r2.cloudflarestorage.com");
    expect(parsed.pathname).toContain("/crate-dig-audio-dev/libraries/lib-1/originals/up-1/");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.headers["Content-Type"]).toBe("audio/wav");

    const again = presignAwsRequest(
      {
        method: "PUT",
        url,
        headers: { "Content-Type": "audio/wav" },
        expiresSeconds: 900,
        amzDate: "20260826T180000Z",
      },
      credentials,
    );
    expect(again.url).toBe(signed.url);
  });

  it("encodes object key segments once", () => {
    expect(encodeS3Path("/bucket/libraries/a/b")).toBe("/bucket/libraries/a/b");
    expect(encodeS3Path("/bucket/track name.wav")).toBe("/bucket/track%20name.wav");
  });
});
