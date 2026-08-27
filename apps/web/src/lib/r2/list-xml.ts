export function unescapeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function parseS3ListObjects(xml: string): {
  keys: string[];
  truncated: boolean;
  nextContinuationToken?: string;
} {
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) =>
    unescapeXmlText(match[1] ?? ""),
  );
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1];
  return {
    keys,
    truncated,
    nextContinuationToken: token ? unescapeXmlText(token) : undefined,
  };
}
