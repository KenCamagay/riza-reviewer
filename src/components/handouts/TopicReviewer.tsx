
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import {
  db,
  type HandoutContent,
  type OutlineItem,
  type ReviewerResult,
  type SavedReviewerPart,
} from "../../db/database";

import {
  buildReviewerSource,
  sourceFingerprint,
} from "../../services/reviewerSource";

type ReviewStyle = "english" | "taglish";

type Props = {
  handoutId: string;
  topic: OutlineItem;
  outline: OutlineItem[];
  content: HandoutContent;
  isPdf: boolean;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
};

export default function TopicReviewer({
  handoutId,
  topic,
  outline,
  content,
  isPdf,
  onClose,
  onJumpToPage,
}: Props) {
  const [style, setStyle] =
    useState<ReviewStyle>("taglish");

  const [accessToken, setAccessToken] = useState(
    () => sessionStorage.getItem("rr-reviewer-token") ?? "",
  );

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const source = useMemo(() => {
    try {
      return {
        chunks: buildReviewerSource(
          content.pages,
          outline,
          topic.id,
        ),
        error: "",
      };
    } catch (err) {
      return {
        chunks: [],
        error:
          err instanceof Error
            ? err.message
            : "Could not prepare this topic.",
      };
    }
  }, [content.pages, outline, topic.id]);

  const records = useLiveQuery(
    () =>
      db.reviewerParts
        .where("topicId")
        .equals(topic.id)
        .toArray(),
    [topic.id],
    [],
  );

  const savedParts = source.chunks
    .map((chunk, index) => {
      const id = `${handoutId}:${topic.id}:${style}:${index}`;

      return records.find(
        (record) =>
          record.id === id &&
          record.sourceFingerprint ===
            sourceFingerprint(chunk),
      );
    })
    .filter(
      (record): record is SavedReviewerPart =>
        record !== undefined,
    );

  const complete =
    source.chunks.length > 0 &&
    savedParts.length === source.chunks.length;

  async function generate(force = false) {
    if (!accessToken.trim()) {
      setError("Enter your reviewer access token first.");
      return;
    }

    if (!consent) {
      setError(
        "Confirm that you're comfortable sending " +
        "the selected handout text to Gemini.",
      );
      return;
    }

    if (source.error || source.chunks.length === 0) {
      setError(source.error || "No text available.");
      return;
    }

    sessionStorage.setItem(
      "rr-reviewer-token",
      accessToken.trim(),
    );

    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError("");
    setProgress(0);

    try {
      for (let i = 0; i < source.chunks.length; i++) {
        if (controller.signal.aborted) break;

        const chunk = source.chunks[i];

        const id =
          `${handoutId}:${topic.id}:${style}:${i}`;

        const fingerprint = sourceFingerprint(chunk);

        const existing = await db.reviewerParts.get(id);

        // Reuse an unchanged part for free.
        if (
          !force &&
          existing?.sourceFingerprint === fingerprint
        ) {
          setProgress(i + 1);
          continue;
        }

        const response = await fetch("/api/reviewer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Reviewer-Token": accessToken.trim(),
          },
          body: JSON.stringify({
            topicTitle: topic.title,
            style,
            sourcePages: chunk.pages,
          }),
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ??
              "The AI reviewer request failed.",
          );
        }

        const record: SavedReviewerPart = {
          id,
          handoutId,
          topicId: topic.id,
          style,
          partIndex: i,
          sourceFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          model: data.model,
          result: data.reviewer as ReviewerResult,
        };

        // Persist each completed part immediately.
        await db.reviewerParts.put(record);

        setProgress(i + 1);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        setError("Generation was cancelled.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Could not generate this reviewer.",
        );
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="rr-ai-backdrop">
      <section
        className="rr-ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rr-ai-title"
      >
        <header className="rr-ai-header">
          <div>
            <span className="rr-small-label">
              HANDOUT-BASED LEARNING
            </span>

            <h2 id="rr-ai-title">
              Your topic reviewer
            </h2>

            <p>{topic.title}</p>
          </div>

          <button
            type="button"
            className="rr-ai-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close reviewer"
          >
            <X size={20} />
          </button>
        </header>

        <div className="rr-ai-body">
          <div className="rr-ai-setup">
            <div className="rr-ai-source">
              <BookOpen size={17} />
              Strictly based on the uploaded handout
            </div>

            <label className="rr-ai-label">
              Explanation language
            </label>

            <div className="rr-ai-style-options">
              <button
                type="button"
                className={style === "taglish" ? "active" : ""}
                onClick={() => setStyle("taglish")}
                disabled={busy}
              >
                Taglish
              </button>

              <button
                type="button"
                className={style === "english" ? "active" : ""}
                onClick={() => setStyle("english")}
                disabled={busy}
              >
                English
              </button>
            </div>

            <label
              className="rr-ai-label"
              htmlFor="rr-reviewer-token"
            >
              Reviewer access token
            </label>

            <input
              id="rr-reviewer-token"
              type="password"
              className="rr-ai-token"
              value={accessToken}
              onChange={(event) =>
                setAccessToken(event.target.value)
              }
              placeholder="Enter your private access token"
              disabled={busy}
              autoComplete="off"
            />

            <label className="rr-ai-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) =>
                  setConsent(event.target.checked)
                }
                disabled={busy}
              />

              <span>
                I understand that selected handout text
                will be sent to Google's Gemini API.
                Free-tier data may be used to improve
                Google's services. I won't send
                identifiable patient information.
              </span>
            </label>

            <div className="rr-ai-summary">
              <span>
                {source.chunks.length} source part(s)
              </span>

              <span>
                {savedParts.length} saved locally
              </span>
            </div>

            {source.error && (
              <p className="rr-ai-error">
                {source.error}
              </p>
            )}

            {error && (
              <p className="rr-ai-error" role="alert">
                {error}
              </p>
            )}

            {busy && (
              <p className="rr-ai-progress" role="status">
                <LoaderCircle
                  size={16}
                  className="rr-spin"
                />
                Processing part {progress + 1} of{" "}
                {source.chunks.length}
              </p>
            )}

            <div className="rr-ai-actions">
              <button
                type="button"
                className="rr-ai-generate"
                onClick={() => void generate()}
                disabled={busy || Boolean(source.error)}
              >
                <Sparkles size={17} />

                {busy
                  ? "Generating..."
                  : complete
                    ? "Reviewer saved"
                    : savedParts.length > 0
                      ? "Continue reviewer"
                      : "Generate reviewer"}
              </button>

              {savedParts.length > 0 && !busy && (
                <button
                  type="button"
                  className="rr-ai-regenerate"
                  onClick={() => void generate(true)}
                >
                  <RefreshCw size={15} />
                  Regenerate
                </button>
              )}

              {busy && (
                <button
                  type="button"
                  className="rr-ai-regenerate"
                  onClick={() => abortRef.current?.abort()}
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          {/* SAVED REVIEWER */}
          {savedParts.length > 0 && (
            <div className="rr-ai-results">
              <div className="rr-ai-results-title">
                <div>
                  <span className="rr-small-label">
                    YOUR STUDY NOTES
                  </span>

                  <h3>{topic.title}</h3>
                </div>

                {complete && (
                  <span className="rr-ai-complete">
                    <CheckCircle2 size={15} />
                    Saved offline
                  </span>
                )}
              </div>

              {savedParts
                .sort(
                  (a, b) =>
                    a.partIndex - b.partIndex,
                )
                .map((part) => (
                  <article
                    className="rr-ai-part"
                    key={part.id}
                  >
                    <span className="rr-small-label">
                      PART {part.partIndex + 1}
                    </span>

                    <h4>{part.result.heading}</h4>

                    <p className="rr-ai-overview">
                      {part.result.overview}
                    </p>

                    <h5>Important points</h5>

                    {part.result.keyPoints.map(
                      (point, index) => (
                        <div
                          key={index}
                          className="rr-ai-point"
                        >
                          <span className="rr-ai-number">
                            {String(index + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>

                          <div>
                            <p>{point.text}</p>

                            <div className="rr-ai-pages">
                              {point.pages.length === 0 && (
                                <span>
                                  Source page not verified
                                </span>
                              )}

                              {point.pages.map((page) => (
                                <button
                                  type="button"
                                  key={page}
                                  onClick={() =>
                                    onJumpToPage(page)
                                  }
                                >
                                  {isPdf
                                    ? `Page ${page}`
                                    : "Source section"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ),
                    )}

                    {part.result.memoryHooks.length > 0 && (
                      <div className="rr-ai-memory">
                        <h5>Memory tricks</h5>

                        {part.result.memoryHooks.map(
                          (item, index) => (
                            <p key={index}>{item}</p>
                          ),
                        )}
                      </div>
                    )}

                    {part.result.unclear.length > 0 && (
                      <div className="rr-ai-unclear">
                        <h5>Needs clarification</h5>

                        {part.result.unclear.map(
                          (item, index) => (
                            <p key={index}>{item}</p>
                          ),
                        )}
                      </div>
                    )}
                  </article>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
