
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";

import {
  ArrowLeft,
  ArrowDownToLine,
  BookOpen,
  Columns2,
  LoaderCircle,
  ScanText,
  ScanLine,
} from "lucide-react";

import { db } from "../db/database";
import { extractDocument } from "../services/documentExtractor";
import {
  scanHandout,
  countPendingOcrPages,
} from "../services/ocrService";
import HandoutExplorer from "../components/handouts/HandoutExplorer";

export default function HandoutReader() {
  const { id } = useParams<{ id: string }>();

  const [pdfView, setPdfView] = useState<
    "reading" | "compare"
  >("reading");

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [ocrWorking, setOcrWorking] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({
    done: 0,
    total: 0,
  });

  const handout = useLiveQuery(
    async () => {
      if (!id) return null;
      return (await db.handouts.get(id)) ?? null;
    },
    [id],
  );

  const content = useLiveQuery(
    async () => {
      if (!id) return null;
      return (await db.handoutContents.get(id)) ?? null;
    },
    [id],
  );

  useEffect(() => {
    if (!handout) return;

    const url = URL.createObjectURL(handout.file);
    setFileUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [handout]);

  async function handleExtraction() {
    if (!handout || working || ocrWorking) return;

    setWorking(true);
    setProgress(0);
    setError("");

    try {
      const result = await extractDocument(
        handout,
        setProgress,
      );

      await db.handoutContents.put({
        id: handout.id,
        pageCount: result.pageCount,
        pages: result.pages,
        extractedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not extract this document.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleOcr() {
    if (!handout || working || ocrWorking) return;

    setOcrWorking(true);
    setError("");
    setOcrProgress({ done: 0, total: 0 });

    try {
      await scanHandout(handout, (done, total) => {
        setOcrProgress({ done, total });
      });
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not scan this document.",
      );
    } finally {
      setOcrWorking(false);
    }
  }

  if (handout === undefined) {
    return (
      <p className="rr-reader-message">
        Loading handout...
      </p>
    );
  }

  if (handout === null) {
    return (
      <div className="rr-reader-message">
        <h2>Handout not found.</h2>
        <Link to="/handouts" className="rr-reader-back">
          <ArrowLeft size={16} />
          Back to library
        </Link>
      </div>
    );
  }

  const isPdf = /\.pdf$/i.test(handout.name);
  const isImage = /\.(png|jpe?g)$/i.test(handout.name);
  const canExtract = isPdf || /\.docx$/i.test(handout.name);

  const showOriginal =
    (isPdf && pdfView === "compare") || isImage;

  const pendingOcrPages =
    isPdf && content ? countPendingOcrPages(content) : 0;

  const workspaceMode = isPdf
    ? pdfView === "compare"
      ? "compare"
      : "reading"
    : isImage
      ? "image"
      : "reading";

  return (
    <div className="rr-reader">
      <Link to="/handouts" className="rr-reader-back">
        <ArrowLeft size={17} />
        Back to library
      </Link>

      {/* DOCUMENT HEADING */}
      <div className="rr-reader-heading">
        <div>
          <span className="rr-small-label">
            YOUR STUDY MATERIAL
          </span>

          <h1>{handout.name}</h1>

          <p>
            {isPdf
              ? "PDF document"
              : isImage
                ? "Image document"
                : "Word document"}
            {" · "}
            Saved on this device
          </p>
        </div>

        <button
          type="button"
          className="rr-button rr-button-outline"
          onClick={() => saveAs(handout.file, handout.name)}
        >
          <ArrowDownToLine size={17} />
          Download
        </button>
      </div>

      {/* PDF VIEW MODE */}
      {isPdf && (
        <div
          className="rr-view-options"
          role="group"
          aria-label="PDF viewing mode"
        >
          <button
            type="button"
            className={`rr-view-option ${
              pdfView === "reading" ? "active" : ""
            }`}
            aria-pressed={pdfView === "reading"}
            onClick={() => setPdfView("reading")}
          >
            <BookOpen size={16} />
            Reading workspace
          </button>

          <button
            type="button"
            className={`rr-view-option ${
              pdfView === "compare" ? "active" : ""
            }`}
            aria-pressed={pdfView === "compare"}
            onClick={() => setPdfView("compare")}
          >
            <Columns2 size={16} />
            Compare with PDF
          </button>
        </div>
      )}

      {/* READING WORKSPACE */}
      <div
        className={`rr-workspace rr-workspace--${workspaceMode}`}
      >
        {/* ORIGINAL DOCUMENT PANEL */}
        {showOriginal && (
          <section
            className="rr-reader-panel rr-workspace__original"
          >
            <div className="rr-reader-panel-title">
              <BookOpen size={18} />
              Original document
            </div>

            <div className="rr-reader-preview">
              {isPdf && fileUrl && (
                <iframe
                  src={fileUrl}
                  title={handout.name}
                  className="rr-reader-frame"
                />
              )}

              {isImage && fileUrl && (
                <img
                  src={fileUrl}
                  alt={handout.name}
                  className="rr-reader-image"
                />
              )}
            </div>
          </section>
        )}

        {/* DOCUMENT TEXT PANEL */}
        <section
          className="rr-reader-panel rr-workspace__text"
        >
          <div className="rr-reader-panel-title">
            <ScanText size={18} />
            Document text
          </div>

          {/* EXTRACTION CONTROLS */}
          <div
            className={`rr-reader-extraction ${
              content
                ? "rr-reader-extraction--compact"
                : ""
            }`}
          >
            {!content && (
              <p>
                Extract the text from this handout to
                prepare it for nursing reviewers,
                topic navigation, and quizzes.
              </p>
            )}

            {canExtract && (
              <button
                type="button"
                className="rr-button rr-button-primary"
                onClick={() => void handleExtraction()}
                disabled={working || ocrWorking}
              >
                {working ? (
                  <LoaderCircle
                    size={17}
                    className="rr-spin"
                  />
                ) : (
                  <ScanText size={17} />
                )}

                {working
                  ? `Extracting ${progress}%`
                  : content
                    ? "Extract again"
                    : "Extract text"}
              </button>
            )}

            {(isImage || pendingOcrPages > 0) && (
              <button
                type="button"
                className="rr-button rr-button-outline"
                onClick={() => void handleOcr()}
                disabled={working || ocrWorking}
              >
                {ocrWorking ? (
                  <LoaderCircle
                    size={17}
                    className="rr-spin"
                  />
                ) : (
                  <ScanLine size={17} />
                )}

                {ocrWorking
                  ? `Scanning ${ocrProgress.done}/${ocrProgress.total}`
                  : isImage
                    ? content
                      ? "Scan image again"
                      : "Scan image text"
                    : `Scan pages needing OCR (${pendingOcrPages})`}
              </button>
            )}

            {working && (
              <div
                className="rr-reader-progress"
                role="progressbar"
                aria-label="Document extraction progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>
            )}

            {ocrWorking && (
              <p className="rr-reader-note">
                Recognizing text on your device.
                Completed {ocrProgress.done} of{" "}
                {ocrProgress.total} pages in this batch.
              </p>
            )}

            {error && (
              <p
                className="rr-reader-error"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          {/* TOPIC EXPLORER AND READING CONTENT */}
          {content && (
           <HandoutExplorer
              key={content.extractedAt}
              handoutId={handout.id}
              content={content}
              isPdf={isPdf}
            />
          )}
        </section>
      </div>
    </div>
  );
}
