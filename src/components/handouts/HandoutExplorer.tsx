
import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, Search, ArrowRight } from "lucide-react";
import type { ExtractedPage, HandoutContent } from "../../db/database";

type NavigationPoint = {
  page: number;
  offset: number;
  length: number;
  title: string;
  preview?: string;
};

type Props = {
  content: HandoutContent;
  isPdf: boolean;
};

function discoverTopics(pages: ExtractedPage[]): NavigationPoint[] {
  const topics: NavigationPoint[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const lines = page.text.matchAll(/[^\r\n]+/g);

    for (const match of lines) {
      const raw = match[0];
      const title = raw.trim();

      if (title.length < 5 || title.length > 100) continue;

      // Examples: TOPIC 1, CHAPTER IV, UNIT 2, MODULE 3
      const numbered = /^(TOPIC|CHAPTER|UNIT|MODULE|LESSON)\s*(?:NO\.?\s*)?(\d+|[IVXLCDM]+)\b/i.test(title);

      // Also recognize short uppercase headings.
      const uppercase =
        title.length >= 12 &&
        title.length <= 80 &&
        title === title.toUpperCase() &&
        /^[A-Z0-9\s/&(),:—–-]+$/.test(title) &&
        title.split(/\s+/).length <= 12 &&
        /[A-Z]{3}/.test(title);

      if (!numbered && !uppercase) continue;

      const key = title.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;

      seen.add(key);

      topics.push({
        page: page.page,
        offset: (match.index ?? 0) + raw.indexOf(title),
        length: title.length,
        title,
      });

      if (topics.length >= 100) return topics;
    }
  }

  return topics;
}

function findMatches(
  pages: ExtractedPage[],
  query: string,
): NavigationPoint[] {
  const needle = query.trim().toLowerCase();

  if (needle.length < 2) return [];

  const results: NavigationPoint[] = [];

  for (const page of pages) {
    const source = page.text;
    const lower = source.toLowerCase();

    let offset = lower.indexOf(needle);

    while (offset !== -1 && results.length < 60) {
      const start = Math.max(0, offset - 55);
      const end = Math.min(source.length, offset + needle.length + 75);

      results.push({
        page: page.page,
        offset,
        length: needle.length,
        title: source.slice(offset, offset + needle.length),
        preview: source.slice(start, end).replace(/\s+/g, " ").trim(),
      });

      offset = lower.indexOf(needle, offset + needle.length);
    }

    if (results.length >= 60) break;
  }

  return results;
}

export default function HandoutExplorer({ content, isPdf }: Props) {
  const [tab, setTab] = useState<"topics" | "search">("topics");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<NavigationPoint | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const scrollArea = useRef<HTMLDivElement>(null);

  const topics = useMemo(
    () => discoverTopics(content.pages),
    [content.pages],
  );

  const matches = useMemo(
    () => findMatches(content.pages, query),
    [content.pages, query],
  );

  const missingPages = isPdf
    ? content.pages.filter((page) => !page.text.trim()).length
    : 0;

  function jumpTo(point: NavigationPoint) {
    const pageIndex = content.pages.findIndex(
      (page) => page.page === point.page,
    );

    if (pageIndex === -1) return;

    setVisibleCount((current) => Math.max(current, pageIndex + 1));
    setActive(point);
  }

  // Scroll inside the text panel, not the entire browser page.
  useEffect(() => {
    if (!active || !scrollArea.current) return;

    const frame = requestAnimationFrame(() => {
      const area = scrollArea.current;
      const mark = area?.querySelector<HTMLElement>(
        "[data-reader-target='true']",
      );

      if (!area || !mark) return;

      const areaRect = area.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();

      area.scrollTo({
        top: Math.max(
          0,
          area.scrollTop + markRect.top - areaRect.top - 28,
        ),
        behavior: "smooth",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [active, visibleCount]);

  function renderText(page: ExtractedPage) {
    const text = page.text;

    if (
      !active ||
      active.page !== page.page ||
      active.offset < 0 ||
      active.offset >= text.length
    ) {
      return text;
    }

    const start = active.offset;
    const end = Math.min(text.length, start + active.length);

    return (
      <>
        {text.slice(0, start)}
        <mark className="rr-match-highlight" data-reader-target="true">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </>
    );
  }

  return (
    <div className="rr-explorer">
      <div className="rr-explorer-controls">
        <div className="rr-explorer-tabs">
          <button
            type="button"
            className={tab === "topics" ? "rr-explorer-tab active" : "rr-explorer-tab"}
            onClick={() => setTab("topics")}
          >
            <ListTree size={15} />
            Topics ({topics.length})
          </button>

          <button
            type="button"
            className={tab === "search" ? "rr-explorer-tab active" : "rr-explorer-tab"}
            onClick={() => setTab("search")}
          >
            <Search size={15} />
            Search text
          </button>
        </div>

        {tab === "topics" ? (
          <div className="rr-explorer-list">
            {topics.length === 0 ? (
              <p className="rr-explorer-empty">
                No recognizable topic headings found. You can still search
                through the document using the Search text tab.
              </p>
            ) : (
              topics.map((topic, index) => (
                <button
                  type="button"
                  className="rr-explorer-item"
                  key={`${topic.page}-${topic.offset}`}
                  onClick={() => jumpTo(topic)}
                >
                  <span className="rr-explorer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="rr-explorer-item-text">{topic.title}</span>
                  <ArrowRight size={14} />
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="rr-explorer-search">
            <div className="rr-explorer-search-field">
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search diseases, terms, concepts..."
                aria-label="Search document text"
              />
            </div>

            {query.trim().length < 2 ? (
              <p className="rr-explorer-empty">
                Enter at least two characters to search this handout.
              </p>
            ) : (
              <>
                <p className="rr-explorer-count">
                  {matches.length >= 60
                    ? "Showing the first 60 matches"
                    : `${matches.length} matches found`}
                </p>

                <div className="rr-explorer-list">
                  {matches.map((match) => (
                    <button
                      type="button"
                      className="rr-explorer-item"
                      key={`${match.page}-${match.offset}`}
                      onClick={() => jumpTo(match)}
                    >
                      <span className="rr-explorer-item-text">
                        <small>
                          {isPdf ? `PAGE ${match.page}` : "DOCUMENT"}
                        </small>
                        {match.preview}
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}

                  {matches.length === 0 && (
                    <p className="rr-explorer-empty">
                      No matching text found in this handout.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rr-reader-result" ref={scrollArea}>
        <div className="rr-reader-result-heading">
          <div>
            <span className="rr-small-label">EXTRACTED CONTENT</span>
            <h2>
              {isPdf
                ? `${content.pageCount} pages`
                : "Document text"}
            </h2>
          </div>
          <span className="rr-reader-saved">Saved locally</span>
        </div>

        {missingPages > 0 && (
          <p className="rr-reader-note">
            {missingPages} page(s) have no selectable text. These may
            require OCR.
          </p>
        )}

        {content.pages.every((page) => !page.text.trim()) && (
          <p className="rr-reader-note">
            No text was found. This document may require OCR.
          </p>
        )}

        {content.pages.slice(0, visibleCount).map((page) => (
          page.text.trim() && (
            <div key={page.page} className="rr-reader-text-page">
              <span>
                {isPdf ? `PAGE ${page.page}` : "DOCUMENT CONTENT"}
              </span>
              <pre>{renderText(page)}</pre>
            </div>
          )
        ))}

        {content.pages.length > visibleCount && (
          <button
            type="button"
            className="rr-reader-more"
            onClick={() => setVisibleCount((count) => count + 5)}
          >
            Show next pages
          </button>
        )}
      </div>
    </div>
  );
}
