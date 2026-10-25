
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ListTree,
  PencilLine,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import TopicReviewer from "./TopicReviewer";
import {
  db,
  type ExtractedPage,
  type HandoutContent,
  type OutlineItem,
} from "../../db/database";

import { detectTopicHeadings } from "../../services/topicOutline";
import TopicManager from "./TopicManager";

type Props = {
  handoutId: string;
  content: HandoutContent;
  isPdf: boolean;
};

type NavigationPoint = {
  page: number;
  offset: number;
  length: number;
  title: string;
  preview?: string;
};

type TopicGroup = {
  main: OutlineItem | null;
  children: OutlineItem[];
};

type ReaderPage = ExtractedPage & {
  baseOffset: number;
};

// Arrange subtopics beneath their preceding main topic.
function groupOutline(items: OutlineItem[]): TopicGroup[] {
  const groups: TopicGroup[] = [];
  let current: TopicGroup | null = null;

  for (const item of items) {
    if (item.level === 1) {
      current = {
        main: item,
        children: [],
      };

      groups.push(current);
    } else {
      if (!current) {
        current = {
          main: null,
          children: [],
        };

        groups.push(current);
      }

      current.children.push(item);
    }
  }

  return groups;
}

// Display only text between the selected main topic
// and the next main topic in document order.
function getReadingPages(
  pages: ExtractedPage[],
  items: OutlineItem[],
  selectedMainId: string | null,
): ReaderPage[] {
  if (!selectedMainId) {
    return pages
      .filter((page) => page.text.trim())
      .map((page) => ({
        ...page,
        baseOffset: 0,
      }));
  }

  const selected = items.find(
    (item) =>
      item.id === selectedMainId &&
      item.level === 1,
  );

  if (!selected) {
    return pages
      .filter((page) => page.text.trim())
      .map((page) => ({
        ...page,
        baseOffset: 0,
      }));
  }

  // Use document position rather than manual outline order.
  const followingMain = items
    .filter(
      (item) =>
        item.level === 1 &&
        (item.page > selected.page ||
          (item.page === selected.page &&
            item.offset > selected.offset)),
    )
    .sort(
      (a, b) =>
        a.page - b.page ||
        a.offset - b.offset,
    )[0];

  const endPage = followingMain?.page ?? Infinity;

  return pages
    .filter(
      (page) =>
        page.page >= selected.page &&
        page.page <= endPage,
    )
    .map((page) => {
      const start =
        page.page === selected.page
          ? Math.max(
              0,
              Math.min(page.text.length, selected.offset),
            )
          : 0;

      const end =
        followingMain &&
        page.page === followingMain.page
          ? Math.max(
              start,
              Math.min(
                page.text.length,
                followingMain.offset,
              ),
            )
          : page.text.length;

      return {
        page: page.page,
        text: page.text.slice(start, end),
        baseOffset: start,
      };
    })
    .filter((page) => page.text.trim());
}

// Search the entire extracted document.
function findMatches(
  pages: ExtractedPage[],
  query: string,
): NavigationPoint[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const results: NavigationPoint[] = [];

  for (const page of pages) {
    const lower = page.text.toLowerCase();
    let offset = lower.indexOf(needle);

    while (offset !== -1 && results.length < 80) {
      const start = Math.max(0, offset - 55);
      const end = Math.min(
        page.text.length,
        offset + needle.length + 75,
      );

      results.push({
        page: page.page,
        offset,
        length: needle.length,
        title: page.text.slice(
          offset,
          offset + needle.length,
        ),
        preview: page.text
          .slice(start, end)
          .replace(/\s+/g, " ")
          .trim(),
      });

      offset = lower.indexOf(
        needle,
        offset + needle.length,
      );
    }

    if (results.length >= 80) break;
  }

  return results;
}

export default function HandoutExplorer({
  handoutId,
  content,
  isPdf,
}: Props) {
  const [tab, setTab] = useState<"topics" | "search">(
    "topics",
  );
  const [reviewTopic, setReviewTopic] =
  useState<OutlineItem | null>(null);
  const [query, setQuery] = useState("");
  const [managingTopics, setManagingTopics] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(),
  );

  const [selectedMainId, setSelectedMainId] = useState<
    string | null
  >(null);

  const [active, setActive] = useState<
    NavigationPoint | null
  >(null);

  const [pageStart, setPageStart] = useState(0);
  const [visibleCount, setVisibleCount] = useState(5);

  const scrollArea = useRef<HTMLDivElement>(null);

  const detectedTopics = useMemo(
    () => detectTopicHeadings(content.pages),
    [content.pages],
  );

  const savedOutline = useLiveQuery(
    async () =>
      (await db.topicOutlines.get(handoutId)) ?? null,
    [handoutId],
  );

  // Initialize only if there isn't already a saved outline.
  useEffect(() => {
    if (savedOutline !== null) return;

    void db
      .transaction("rw", db.topicOutlines, async () => {
        const existing =
          await db.topicOutlines.get(handoutId);

        if (!existing) {
          await db.topicOutlines.add({
            id: handoutId,
            items: detectedTopics,
            updatedAt: new Date().toISOString(),
          });
        }
      })
      .catch(console.error);
  }, [savedOutline, handoutId, detectedTopics]);

  const outline = savedOutline?.items ?? detectedTopics;

  const groups = useMemo(
    () => groupOutline(outline),
    [outline],
  );

  const mainCount = outline.filter(
    (item) => item.level === 1,
  ).length;

  const subCount = outline.filter(
    (item) => item.level === 2,
  ).length;

  const selectedMain = outline.find(
    (item) => item.id === selectedMainId,
  );

  const readingPages = useMemo(
    () =>
      getReadingPages(
        content.pages,
        outline,
        selectedMainId,
      ),
    [content.pages, outline, selectedMainId],
  );

  const matches = useMemo(
    () => findMatches(content.pages, query),
    [content.pages, query],
  );

  const missingPages = isPdf
    ? content.pages.filter(
        (page) => !page.text.trim(),
      ).length
    : 0;

  // Open/close a main topic's subtopics.
  function toggleGroup(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function navigateTo(
    point: NavigationPoint,
    mainId: string | null,
  ) {
    const relevantPages = getReadingPages(
      content.pages,
      outline,
      mainId,
    );

    const index = relevantPages.findIndex(
      (page) => page.page === point.page,
    );

    setSelectedMainId(mainId);
    setPageStart(Math.max(0, index - 1));
    setVisibleCount(5);
    setActive({ ...point });
  }

  function openMainTopic(item: OutlineItem) {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.add(item.id);
      return next;
    });

    navigateTo(item, item.id);
  }

  function openSubtopic(
    item: OutlineItem,
    parentId: string | null,
  ) {
    navigateTo(item, parentId);
  }

  function showFullDocument() {
    setSelectedMainId(null);
    setActive(null);
    setPageStart(0);
    setVisibleCount(5);

    scrollArea.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveOutline(items: OutlineItem[]) {
    await db.topicOutlines.put({
      id: handoutId,
      items,
      updatedAt: new Date().toISOString(),
    });

    setManagingTopics(false);
    setSelectedMainId(null);
    setActive(null);
    setPageStart(0);
    setVisibleCount(5);
  }

  // Scroll to the selected heading or search result.
  useEffect(() => {
    if (!active || !scrollArea.current) return;

    const frame = requestAnimationFrame(() => {
      const area = scrollArea.current;
      if (!area) return;

      const mark = area.querySelector<HTMLElement>(
        "[data-reader-target='true']",
      );

      if (!mark) {
        area.scrollTop = 0;
        return;
      }

      const areaRect = area.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();

      area.scrollTo({
        top: Math.max(
          0,
          area.scrollTop +
            markRect.top -
            areaRect.top -
            28,
        ),
        behavior: "smooth",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [active, selectedMainId, pageStart, visibleCount]);

  function renderText(page: ReaderPage) {
    if (!active || active.page !== page.page) {
      return page.text;
    }

    const start = active.offset - page.baseOffset;
    const end = start + active.length;

    if (
      start < 0 ||
      start >= page.text.length
    ) {
      return page.text;
    }

    return (
      <>
        {page.text.slice(0, start)}
        <mark
          className="rr-match-highlight"
          data-reader-target="true"
        >
          {page.text.slice(
            start,
            Math.min(end, page.text.length),
          )}
        </mark>
        {page.text.slice(end)}
      </>
    );
  }

  return (
    <div className="rr-explorer">
      {/* TOPIC NAVIGATION */}
      <div className="rr-explorer-controls">
        <div className="rr-explorer-tabs">
          <button
            type="button"
            className={`rr-explorer-tab ${
              tab === "topics" ? "active" : ""
            }`}
            onClick={() => setTab("topics")}
          >
            <ListTree size={15} />
            Topics
          </button>

          <button
            type="button"
            className={`rr-explorer-tab ${
              tab === "search" ? "active" : ""
            }`}
            onClick={() => setTab("search")}
          >
            <Search size={15} />
            Search
          </button>
        </div>

        {tab === "topics" ? (
          <>
            <div className="rr-outline-summary">
              <span>
                {mainCount} main · {subCount} subtopics
              </span>

              <button
                type="button"
                onClick={() => setManagingTopics(true)}
              >
                <PencilLine size={13} />
                Organize
              </button>
            </div>

            <div className="rr-explorer-list rr-topic-tree">
              {groups.length === 0 && (
                <p className="rr-explorer-empty">
                  No topics detected. Use Organize
                  to create a topic outline.
                </p>
              )}

              {groups.map((group, index) => {
                const main = group.main;

                if (!main) {
                  return (
                    <div
                      className="rr-topic-tree-group"
                      key="unassigned"
                    >
                      <p className="rr-topic-tree-label">
                        Unassigned subtopics
                      </p>

                      {group.children.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className="rr-topic-tree-sub"
                          onClick={() =>
                            openSubtopic(sub, null)
                          }
                        >
                          <span>{sub.title}</span>
                          <ArrowRight size={13} />
                        </button>
                      ))}
                    </div>
                  );
                }

                const isExpanded = expanded.has(main.id);
                const isSelected =
                  selectedMainId === main.id;

                return (
                  <div
                    className="rr-topic-tree-group"
                    key={main.id}
                  >
                    <div
                      className={`rr-topic-tree-main ${
                        isSelected ? "selected" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="rr-topic-tree-open"
                        onClick={() => openMainTopic(main)}
                        title="Read this entire topic"
                      >
                        <span className="rr-topic-tree-number">
                          {String(index + 1).padStart(
                            2,
                            "0",
                          )}
                        </span>

                        <span className="rr-topic-tree-title">
                          {main.title}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="rr-topic-tree-toggle"
                        onClick={() =>
                          toggleGroup(main.id)
                        }
                        aria-expanded={isExpanded}
                        aria-label={`${
                          isExpanded
                            ? "Collapse"
                            : "Expand"
                        } ${main.title}`}
                      >
                        {isExpanded ? (
                          <ChevronDown size={17} />
                        ) : (
                          <ChevronRight size={17} />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="rr-topic-tree-children">
                        {group.children.length === 0 ? (
                          <p className="rr-topic-tree-empty">
                            No subtopics listed
                          </p>
                        ) : (
                          group.children.map((sub) => (
                            <button
                              type="button"
                              key={sub.id}
                              className="rr-topic-tree-sub"
                              onClick={() =>
                                openSubtopic(
                                  sub,
                                  main.id,
                                )
                              }
                            >
                              <span>{sub.title}</span>
                              <ArrowRight size={13} />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rr-explorer-search">
            <div className="rr-explorer-search-field">
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search this handout..."
                aria-label="Search document text"
              />
            </div>

            <p className="rr-explorer-count">
              {query.trim().length < 2
                ? "Enter at least two characters."
                : matches.length >= 80
                  ? "Showing first 80 matches"
                  : `${matches.length} matches`}
            </p>

            <div className="rr-explorer-list">
              {matches.map((match) => (
                <button
                  type="button"
                  className="rr-explorer-item"
                  key={`${match.page}-${match.offset}`}
                  onClick={() =>
                    navigateTo(match, null)
                  }
                >
                  <span className="rr-explorer-item-text">
                    <small>
                      {isPdf
                        ? `PAGE ${match.page}`
                        : "DOCUMENT"}
                    </small>
                    {match.preview}
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* READING AREA */}
      <div
        className="rr-reader-result"
        ref={scrollArea}
      >
        <div className="rr-reader-result-heading">
          <div>
            <span className="rr-small-label">
              {selectedMain
                ? "NOW READING"
                : "EXTRACTED CONTENT"}
            </span>

            <h2>
              {selectedMain
                ? selectedMain.title
                : isPdf
                  ? `${content.pageCount} pages`
                  : "Document text"}
            </h2>
          </div>

          {selectedMainId ? (
            <button
              type="button"
              className="rr-show-full"
              onClick={showFullDocument}
            >
              <X size={14} />
              Show all
            </button>
          ) : (
            <span className="rr-reader-saved">
              Saved locally
            </span>
          )}
          {selectedMain && (
            <button
              type="button"
              className="rr-ai-launch"
              onClick={() => setReviewTopic(selectedMain)}
            >
              <Sparkles size={15} />
              Generate reviewer
            </button>
          )}
        </div>

        {missingPages > 0 && !selectedMainId && (
          <p className="rr-reader-note">
            {missingPages} PDF pages have no extracted
            text and may need OCR.
          </p>
        )}

        {readingPages.length === 0 && (
          <p className="rr-reader-note">
            No extracted text is available for this
            section. Check the topic location or
            scan the relevant pages.
          </p>
        )}

        {readingPages
          .slice(pageStart, pageStart + visibleCount)
          .map((page) => (
            <div
              key={page.page}
              className="rr-reader-text-page"
            >
              <span>
                {isPdf
                  ? `PAGE ${page.page}`
                  : "DOCUMENT CONTENT"}
              </span>

              <pre>{renderText(page)}</pre>
            </div>
          ))}

        {pageStart + visibleCount <
          readingPages.length && (
          <button
            type="button"
            className="rr-reader-more"
            onClick={() =>
              setVisibleCount((count) => count + 5)
            }
          >
            Show next pages
          </button>
        )}
      </div>

      {/* MANUAL TOPIC EDITOR */}
      {managingTopics && (
        <TopicManager
          items={outline}
          pageCount={content.pageCount}
          onClose={() => setManagingTopics(false)}
          onSave={saveOutline}
          onRedetect={() =>
            detectTopicHeadings(content.pages)
          }
        />
      )}
      {reviewTopic && (
        <TopicReviewer
          handoutId={handoutId}
          topic={reviewTopic}
          outline={outline}
          content={content}
          isPdf={isPdf}
          onClose={() => setReviewTopic(null)}
          onJumpToPage={(page) => {
            const topicId = reviewTopic.id;

            setReviewTopic(null);

            navigateTo(
              {
                page,
                offset: 0,
                length: 0,
                title: "",
              },
              topicId,
            );
          }}
        />
      )}
    </div>
  );
}
