import { describe, expect, it } from "vitest";
import { parseS3ListObjects, unescapeXmlText } from "./list-xml";

describe("parseS3ListObjects", () => {
  it("unescapes keys and continuation tokens", () => {
    expect(unescapeXmlText("Above &amp; Beyond")).toBe("Above & Beyond");
    const parsed = parseS3ListObjects(`
      <ListBucketResult>
        <Contents><Key>demo/originals/Above &amp; Beyond/track.mp3</Key></Contents>
        <Contents><Key>demo/originals/DON&apos;T SLIP.mp3</Key></Contents>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>abc&amp;def</NextContinuationToken>
      </ListBucketResult>
    `);
    expect(parsed.keys).toEqual([
      "demo/originals/Above & Beyond/track.mp3",
      "demo/originals/DON'T SLIP.mp3",
    ]);
    expect(parsed.truncated).toBe(true);
    expect(parsed.nextContinuationToken).toBe("abc&def");
  });
});
