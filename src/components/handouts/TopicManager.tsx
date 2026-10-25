
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import type { OutlineItem } from "../../db/database";

interface Props {
  items: OutlineItem[];
  pageCount: number;
  onClose: () => void;
  onSave: (items: OutlineItem[]) => Promise<void>;
  onRedetect: () => OutlineItem[];
}

export default function TopicManager({
  items,
  pageCount,
  onClose,
  onSave,
  onRedetect,
}: Props) {
  const [draft, setDraft] = useState<OutlineItem[]>(
    () => items.map((item) => ({ ...item })),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, saving]);

  function updateItem(
    id: string,
    changes: Partial<OutlineItem>,
  ) {
    setDraft((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    );
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= draft.length) return;

    setDraft((current) => {
      const next = [...current];

      [next[index], next[target]] = [
        next[target],
        next[index],
      ];

      return next;
    });
  }

  function addTopic() {
    setDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "",
        level: 1,
        page: 1,
        offset: 0,
        length: 0,
      },
    ]);
  }

  function redetect() {
    if (
      !window.confirm(
        "Replace your current draft with detected headings? Save afterward to apply.",
      )
    ) {
      return;
    }

    setDraft(onRedetect());
  }

  async function handleSave() {
    const cleaned = draft
      .filter((item) => item.title.trim())
      .map((item) => ({
        ...item,
        title: item.title.trim(),
        page: Math.min(
          Math.max(1, Number(item.page) || 1),
          Math.max(1, pageCount),
        ),
      }));

    setSaving(true);
    setError("");

    try {
      await onSave(cleaned);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save topic outline.",
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="rr-topic-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rr-topic-title"
        className="rr-topic-dialog"
      >
        <div className="rr-topic-header">
          <div>
            <span className="rr-small-label">
              ORGANIZE YOUR MATERIAL
            </span>

            <h2 id="rr-topic-title">Topic outline</h2>

            <p>
              Rename headings, create subtopics, and correct
              page locations before generating reviewers.
            </p>
          </div>

          <button
            type="button"
            className="rr-topic-icon"
            onClick={onClose}
            disabled={saving}
            aria-label="Close topic manager"
          >
            <X size={20} />
          </button>
        </div>

        <div className="rr-topic-actions">
          <button
            type="button"
            onClick={addTopic}
            className="rr-topic-secondary"
          >
            <Plus size={16} />
            Add topic
          </button>

          <button
            type="button"
            onClick={redetect}
            className="rr-topic-secondary"
          >
            <RotateCcw size={16} />
            Re-detect headings
          </button>

          <span>{draft.length} entries</span>
        </div>

        <div className="rr-topic-list">
          {draft.length === 0 && (
            <p className="rr-topic-empty">
              No headings found. Add your first main topic
              using the button above.
            </p>
          )}

          {draft.map((item, index) => (
            <div className="rr-topic-row" key={item.id}>
              <span className="rr-topic-index">
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="rr-topic-name">
                <label htmlFor={`topic-name-${item.id}`}>
                  Heading
                </label>

                <input
                  id={`topic-name-${item.id}`}
                  value={item.title}
                  placeholder="Enter topic title"
                  onChange={(event) =>
                    updateItem(item.id, {
                      title: event.target.value,
                    })
                  }
                />
              </div>

              <div className="rr-topic-level">
                <label htmlFor={`topic-level-${item.id}`}>
                  Level
                </label>

                <select
                  id={`topic-level-${item.id}`}
                  value={item.level}
                  onChange={(event) =>
                    updateItem(item.id, {
                      level:
                        Number(event.target.value) === 1
                          ? 1
                          : 2,
                    })
                  }
                >
                  <option value={1}>Main topic</option>
                  <option value={2}>Subtopic</option>
                </select>
              </div>

              <div className="rr-topic-page">
                <label htmlFor={`topic-page-${item.id}`}>
                  Page
                </label>

                <input
                  id={`topic-page-${item.id}`}
                  type="number"
                  min={1}
                  max={Math.max(1, pageCount)}
                  value={item.page}
                  onChange={(event) =>
                    updateItem(item.id, {
                      page: Number(event.target.value),
                    })
                  }
                />
              </div>

              <div className="rr-topic-row-actions">
                <button
                  type="button"
                  title="Move up"
                  aria-label={`Move ${item.title} up`}
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>

                <button
                  type="button"
                  title="Move down"
                  aria-label={`Move ${item.title} down`}
                  disabled={index === draft.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>

                <button
                  type="button"
                  title="Remove heading"
                  aria-label={`Remove ${item.title}`}
                  onClick={() =>
                    setDraft((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rr-topic-footer">
          <p>
            Changes are saved locally. Re-detecting will
            replace the draft, not the original handout.
          </p>

          {error && <p role="alert">{error}</p>}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rr-topic-save"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save outline"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
