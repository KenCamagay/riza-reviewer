
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type {
  Handout,
  ExtractedPage,
} from "../db/database";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface ExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
}

export async function extractDocument(
  handout: Handout,
  onProgress: (progress: number) => void,
): Promise<ExtractionResult> {
  const name = handout.name.toLowerCase();

  // Extract PDF text, keeping page references.
  if (name.endsWith(".pdf")) {
    const buffer = await handout.file.arrayBuffer();

    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
    });

    const pdf = await task.promise;
    const pages: ExtractedPage[] = [];

    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();

        const text = content.items
          .map((item) => {
            if (!("str" in item)) return "";

            return item.str + (item.hasEOL ? "\n" : " ");
          })
          .join("")
          .trim();

        pages.push({
          page: number,
          text,
        });

        onProgress(
          Math.round((number / pdf.numPages) * 100),
        );

        page.cleanup();
      }

      return {
        pageCount: pdf.numPages,
        pages,
      };
   } finally {
    await task.destroy();
    }
  }

  // Extract editable Word document text.
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");

    const result = await mammoth.extractRawText({
      arrayBuffer: await handout.file.arrayBuffer(),
    });

    onProgress(100);

    return {
      pageCount: 1,
      pages: [
        {
          page: 1,
          text: result.value.trim(),
        },
      ],
    };
  }

  throw new Error(
    "Text extraction currently supports PDF and DOCX. Image OCR is coming next.",
  );
}
