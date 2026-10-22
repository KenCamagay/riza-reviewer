
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

class RizaDatabase extends Dexie {
  handouts!: Table<Handout, string>;
  handoutContents!: Table<HandoutContent, string>;

  constructor() {
    super("riza-reviewer");

    this.version(1).stores({
      handouts: "id, name, addedAt",
    });

    this.version(2).stores({
      handoutContents: "id, extractedAt",
    });
  }
}

export const db = new RizaDatabase();
