
import type {
  ExtractedPage,
  OutlineItem,
} from "../db/database";

export type SourceChunk = {
  pages: {
    page: number;
    text: string;
  }[];
};

const MAX_CHARS = 8500;
const MAX_PARTS = 16;

export function buildReviewerSource(
  pages: ExtractedPage[],
  outline: OutlineItem[],
  topicId: string,
): SourceChunk[] {
  const topic = outline.find(
    (item) =>
      item.id === topicId &&
      item.level === 1,
  );

  if (!topic) {
    throw new Error("Select a valid main topic first.");
  }

  const nextTopic = outline
    .filter(
      (item) =>
        item.level === 1 &&
        item.id !== topic.id &&
        (item.page > topic.page ||
          (item.page === topic.page &&
            item.offset > topic.offset)),
    )
    .sort(
      (a, b) =>
        a.page - b.page ||
        a.offset - b.offset,
    )[0];

  const sections: {
    page: number;
    text: string;
  }[] = [];

  let missingPages = 0;

  for (const page of pages) {
    if (page.page < topic.page) continue;

    if (nextTopic && page.page > nextTopic.page) {
      break;
    }

    const start =
      page.page === topic.page
        ? Math.min(
            page.text.length,
            Math.max(0, topic.offset),
          )
        : 0;

    const end =
      nextTopic && page.page === nextTopic.page
        ? Math.min(
            page.text.length,
            Math.max(0, nextTopic.offset),
          )
        : page.text.length;

    if (
        !page.text.trim() &&
        page.page >= topic.page &&
        (!nextTopic || page.page < nextTopic.page)
    ) {
        missingPages++;
        continue;
    }

        if (end <= start) continue;

        const text = page.text.slice(start, end);

    if (!text.trim()) {
      missingPages++;
      continue;
    }

    sections.push({
      page: page.page,
      text,
    });
  }

  if (missingPages > 0) {
    throw new Error(
      `${missingPages} page(s) in this topic have no extracted text. ` +
      "Check or OCR those pages before generating a complete reviewer.",
    );
  }

  if (sections.length === 0) {
    throw new Error(
      "No extracted text was found for this topic. " +
      "Check the topic boundaries in Organize.",
    );
  }

  // Split large source sections without discarding
  // their text or page references.
  const segments: {
    page: number;
    text: string;
  }[] = [];

  for (const section of sections) {
    let remaining = section.text;

    while (remaining.length > 0) {
      let cut = Math.min(
        MAX_CHARS,
        remaining.length,
      );

      if (remaining.length > MAX_CHARS) {
        const newline = remaining.lastIndexOf(
          "\n",
          cut,
        );

        const space = remaining.lastIndexOf(
          " ",
          cut,
        );

        const boundary =
          newline > MAX_CHARS / 2
            ? newline + 1
            : space > MAX_CHARS / 2
              ? space + 1
              : cut;

        cut = boundary;
      }

      const piece = remaining.slice(0, cut);

      if (piece.trim()) {
        segments.push({
          page: section.page,
          text: piece,
        });
      }

      remaining = remaining.slice(cut);
    }
  }

  const chunks: SourceChunk[] = [];
  let current: SourceChunk = { pages: [] };
  let size = 0;

  function flush() {
    if (current.pages.length === 0) return;

    chunks.push(current);
    current = { pages: [] };
    size = 0;
  }

  for (const segment of segments) {
    if (
      size + segment.text.length > MAX_CHARS &&
      current.pages.length > 0
    ) {
      flush();
    }

    current.pages.push(segment);
    size += segment.text.length;
  }

  flush();

  if (chunks.length > MAX_PARTS) {
    throw new Error(
      `This topic requires ${chunks.length} AI requests. ` +
      "To protect the free quota, divide this topic " +
      "into smaller main topics using Organize. " +
      "No content has been sent or skipped.",
    );
  }

  return chunks;
}

export function sourceFingerprint(
  chunk: SourceChunk,
): string {
  const input = JSON.stringify(chunk.pages);

  let hash = 2166136261;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // Change-detection fingerprint, not a security hash.
  return `${input.length}-${hash >>> 0}`;
}
