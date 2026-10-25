
import type {
  ExtractedPage,
  OutlineItem,
} from "../db/database";

export function detectTopicHeadings(
  pages: ExtractedPage[],
): OutlineItem[] {
  const results: OutlineItem[] = [];
  const seen = new Set<string>();

  let currentMain = "";

  for (const page of pages) {
    const lines = page.text.matchAll(/[^\r\n]+/g);

    for (const match of lines) {
      const raw = match[0];

      const title = raw
        .trim()
        .replace(/^[^A-Za-z0-9]+/, "")
        .trim();

      if (title.length < 6 || title.length > 110) {
        continue;
      }

      let level: 1 | 2;

      const isMain =
        /^(TOPIC|CHAPTER|UNIT|MODULE|LESSON)\s*(?:NO\.?\s*)?(\d{1,3}|[IVXLCDM]{1,6})\b/i.test(
          title,
        );

      if (isMain) {
        level = 1;
      } else {
        if (!currentMain) continue;

        const isPart =
          /^(PART|SECTION|SUBTOPIC)\s+[A-Z0-9]+\s*[-—–:.]\s*.+/i.test(
            title,
          );

        const numbered = title.match(
          /^\d{1,2}(?:\.\d{1,2})*[.)]\s+(.+)$/,
        );

        const headingText = numbered?.[1] ?? "";

        const letters = headingText.replace(
          /[^A-Za-z]/g,
          "",
        );

        const isUppercaseNumbered =
          Boolean(numbered) &&
          headingText.length >= 6 &&
          headingText.length <= 85 &&
          headingText.split(/\s+/).length <= 12 &&
          letters.length >= 6 &&
          letters === letters.toUpperCase();

        if (!isPart && !isUppercaseNumbered) {
          continue;
        }

        level = 2;
      }

      // Avoid numeric table rows.
      const digitCount = (
        title.match(/\d/g) ?? []
      ).length;

      if (digitCount > 8) continue;

      const normalized = title
        .toLowerCase()
        .replace(/\s+/g, " ");

      // Main headings must be unique.
      // Subheadings can repeat under different main topics.
      const key =
        level === 1
          ? `main:${normalized}`
          : `sub:${currentMain}:${normalized}`;

      if (seen.has(key)) continue;

      seen.add(key);

      if (level === 1) {
        currentMain = normalized;
      }

      results.push({
        id: crypto.randomUUID(),
        title,
        level,
        page: page.page,
        offset:
          (match.index ?? 0) +
          Math.max(0, raw.indexOf(title)),
        length: title.length,
      });
    }
  }

  return results;
}
