
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  db,
  type Handout,
  type HandoutContent,
} from "../db/database";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const BATCH_SIZE = 5;
const MAX_IMAGE_DIMENSION = 2000;

/**
 * Return PDF pages that may require OCR.
 * Pages already checked will not be scanned again.
 */
export function countPendingOcrPages(
  content: HandoutContent,
): number {
  const checked = new Set(content.ocrCheckedPages ?? []);

  return content.pages.filter(
    (page) =>
      page.text.trim().length < 25 &&
      !checked.has(page.page),
  ).length;
}

/**
 * Render a scanned PDF page into a canvas.
 */
async function renderPdfPage(
  pdf: pdfjs.PDFDocumentProxy,
  pageNumber: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);

  const original = page.getViewport({ scale: 1 });

  const scale = Math.min(
    2,
    MAX_IMAGE_DIMENSION /
      Math.max(original.width, original.height),
  );

  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  try {
    await page.render({
      canvas,
      viewport,
    }).promise;

    return canvas;
  } finally {
    page.cleanup();
  }
}

/**
 * Resize large uploaded images before recognition.
 */
async function prepareImage(
  file: Blob,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION /
        Math.max(bitmap.width, bitmap.height),
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not prepare image for OCR.");
    }

    context.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas;
  } finally {
    bitmap.close();
  }
}

/**
 * Scan a handout locally and save recognized text.
 *
 * Each successfully completed page is saved immediately.
 */
export async function scanHandout(
  handout: Handout,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const isPdf = /\.pdf$/i.test(handout.name);
  const isImage = /\.(png|jpe?g)$/i.test(handout.name);

  if (!isPdf && !isImage) {
    throw new Error(
      "OCR currently supports PDF, JPG, and PNG files.",
    );
  }

  const existing = await db.handoutContents.get(handout.id);

  if (isPdf && !existing) {
    throw new Error(
      "Extract the PDF text first, then scan pages requiring OCR.",
    );
  }

  let current: HandoutContent = existing ?? {
    id: handout.id,
    pageCount: 1,
    pages: [{ page: 1, text: "" }],
    extractedAt: new Date().toISOString(),
  };

  const checked = new Set(current.ocrCheckedPages ?? []);

  const pagesToScan = isImage
    ? [1]
    : current.pages
        .filter(
          (page) =>
            page.text.trim().length < 25 &&
            !checked.has(page.page),
        )
        .map((page) => page.page)
        .slice(0, BATCH_SIZE);

  if (pagesToScan.length === 0) {
    return 0;
  }

  onProgress(0, pagesToScan.length);

  // Load Tesseract only when OCR is requested.
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng");

  let pdfTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  let completed = 0;

  try {
    if (isPdf) {
      const buffer = await handout.file.arrayBuffer();

      pdfTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
      });

      await pdfTask.promise;
    }

    for (const pageNumber of pagesToScan) {
      let canvas: HTMLCanvasElement | null = null;

      try {
        if (isPdf && pdfTask) {
          const pdf = await pdfTask.promise;
          canvas = await renderPdfPage(pdf, pageNumber);
        } else {
          canvas = await prepareImage(handout.file);
        }

        const result = await worker.recognize(canvas);
        const recognizedText = result.data.text.trim();

        const oldPage = current.pages.find(
          (page) => page.page === pageNumber,
        );

        // Preserve original text if OCR finds nothing.
        const newPages = current.pages.map((page) =>
          page.page === pageNumber
            ? {
                ...page,
                text: recognizedText || page.text,
              }
            : page,
        );

        if (!oldPage) {
          newPages.push({
            page: pageNumber,
            text: recognizedText,
          });
        }

        checked.add(pageNumber);

        current = {
          ...current,
          pages: newPages,
          ocrCheckedPages: Array.from(checked),
        };

        // Save each completed page independently.
        await db.handoutContents.put(current);

        completed++;
        onProgress(completed, pagesToScan.length);
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }

    return completed;
  } finally {
    await pdfTask?.destroy();
    await worker.terminate();
  }
}
