
import Dexie, { type Table } from "dexie";

export interface Handout {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  file: Blob;
}

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface HandoutContent {
  id: string;
  pageCount: number;
  pages: ExtractedPage[];
  extractedAt: string;
  ocrCheckedPages?: number[];
}

export interface OutlineItem {
  id: string;
  title: string;
  level: 1 | 2;
  page: number;
  offset: number;
  length: number;
}

export interface HandoutOutline {
  id: string;
  items: OutlineItem[];
  updatedAt: string;
}


export interface ReviewerPoint {
  text: string;
  pages: number[];
}

export interface ReviewerResult {
  heading: string;
  overview: string;
  keyPoints: ReviewerPoint[];
  memoryHooks: string[];
  unclear: string[];
}

export interface SavedReviewerPart {
  id: string;
  handoutId: string;
  topicId: string;
  style: "english" | "taglish";
  partIndex: number;
  sourceFingerprint: string;
  createdAt: string;
  model: string;
  result: ReviewerResult;
}


class RizaDatabase extends Dexie {
  handouts!: Table<Handout, string>;
  handoutContents!: Table<HandoutContent, string>;
  topicOutlines!: Table<HandoutOutline, string>;
  reviewerParts!: Table<SavedReviewerPart, string>;


  constructor() {
    super("riza-reviewer");

    this.version(1).stores({
      handouts: "id, name, addedAt",
    });

    this.version(2).stores({
      handoutContents: "id, extractedAt",
    });

    this.version(3).stores({
      topicOutlines: "id, updatedAt",
    });
    this.version(4).stores({
      reviewerParts:
        "id, handoutId, topicId, createdAt",
    });
  }
}

export const db = new RizaDatabase();
