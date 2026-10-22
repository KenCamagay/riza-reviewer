import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { saveAs } from "file-saver";
import HandoutReader from "./pages/HandoutReader";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  CloudOff,
  FileImage,
  FileText,
  FileType2,
  FolderOpen,
  HardDrive,
  LibraryBig,
  Menu,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { db, type Handout } from "./db/database";

const ACCEPTED_TYPES = ".pdf,.docx,.png,.jpg,.jpeg";
const supportedFile = (file: File) => /\.(pdf|docx|png|jpe?g)$/i.test(file.name);

function formatSize(size: number): string {
  if (size === 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(value));
}

function getKind(name: string): "PDF" | "DOCX" | "IMAGE" {
  if (/\.pdf$/i.test(name)) return "PDF";
  if (/\.docx$/i.test(name)) return "DOCX";
  return "IMAGE";
}

function FileSymbol({ name }: { name: string }) {
  const kind = getKind(name);
  const Icon = kind === "IMAGE" ? FileImage : kind === "DOCX" ? FileType2 : FileText;
  return (
    <span className={`rr-file-icon rr-file-icon--${kind.toLowerCase()}`}>
      <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
    </span>
  );
}

function useHandoutUpload() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function upload(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    const valid = selected.filter(supportedFile);
    if (valid.length === 0) {
      setNotice("Please choose a PDF, DOCX, JPG, or PNG file.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const stamp = new Date().toISOString();
      const records: Handout[] = valid.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        addedAt: stamp,
        file,
      }));
      await db.handouts.bulkAdd(records);
      if (valid.length !== selected.length) {
        setNotice("Some unsupported files were skipped. Use PDF, DOCX, JPG, or PNG.");
      }
    } catch (error) {
      console.error("Unable to save handouts", error);
      setNotice("Couldn't save the file. Please check this browser's available storage.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, notice, setNotice, upload };
}

function UploadButton({ onFiles, busy, children, className = "" }: {
  onFiles: (files: FileList) => void;
  busy: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) onFiles(event.target.files);
    event.target.value = "";
  }
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        className="rr-visually-hidden"
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        aria-label="Choose handouts to upload"
        onChange={onChange}
        tabIndex={-1}
      />
    </>
  );
}

function Brand() {
  return (
    <Link to="/" className="rr-brand" aria-label="Riza Reviewer home">
      <span className="rr-brand-mark"><BookOpen size={22} strokeWidth={1.8} /></span>
      <span className="rr-brand-text"><strong>riza<span className="rr-brand-dot">.</span></strong><small>YOUR STUDY COMPANION</small></span>
    </Link>
  );
}

function MainNav({ afterNavigate }: { afterNavigate?: () => void }) {
  return (
    <nav aria-label="Primary navigation" className="rr-nav">
      <NavLink end to="/" onClick={afterNavigate} className={({ isActive }) => `rr-nav-item ${isActive ? "is-active" : ""}`}>
        <BookOpen size={18} strokeWidth={1.7} /><span>Study desk</span><ChevronRight className="rr-nav-chevron" size={15} />
      </NavLink>
      <NavLink to="/handouts" onClick={afterNavigate} className={({ isActive }) => `rr-nav-item ${isActive ? "is-active" : ""}`}>
        <LibraryBig size={18} strokeWidth={1.7} /><span>My library</span><ChevronRight className="rr-nav-chevron" size={15} />
      </NavLink>
      <div className="rr-nav-subhead">COMING NEXT</div>
      <div className="rr-nav-item rr-nav-item--disabled"><FileText size={18} strokeWidth={1.7} /><span>Reviewers</span><span className="rr-nav-soon">Soon</span></div>
      <div className="rr-nav-item rr-nav-item--disabled"><Sparkles size={18} strokeWidth={1.7} /><span>Practice quizzes</span><span className="rr-nav-soon">Soon</span></div>
    </nav>
  );
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const currentDate = new Intl.DateTimeFormat("en-PH", {
    month: "long", day: "numeric", year: "numeric",
  }).format(new Date());
  return (
    <div className="rr-app">
      <aside className="rr-sidebar">
        <Brand />
        <div className="rr-sidebar-nav"><div className="rr-side-label">WORKSPACE</div><MainNav /></div>
        <div className="rr-sidebar-footer">
          <span className="rr-online-dot" aria-hidden="true" />
          <div><strong>Private by default</strong><span>Handouts stay on this device.</span></div>
        </div>
      </aside>

      {menuOpen && <button type="button" className="rr-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}
      <aside className={`rr-mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="rr-mobile-menu-heading"><Brand /><button className="rr-icon-button" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
        <MainNav afterNavigate={() => setMenuOpen(false)} />
      </aside>

      <div className="rr-main-area">
        <header className="rr-topbar">
          <button type="button" className="rr-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="rr-topbar-left"><span className="rr-topbar-mark" /> THE PERSONAL STUDY SPACE</div>
          <div className="rr-topbar-right"><Clock3 size={15} strokeWidth={1.6} /><span>{currentDate}</span></div>
        </header>
        <main className="rr-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/handouts" element={<Library />} />
            <Route path="*" element={<NotFound />} />
            <Route
              path="/handouts/:id"
              element={<HandoutReader />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Alert({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  if (!text) return null;
  return <div role="alert" className="rr-alert"><span>{text}</span><button type="button" onClick={onDismiss} aria-label="Dismiss message"><X size={17} /></button></div>;
}

function Dashboard() {
  const handouts = useLiveQuery(() => db.handouts.orderBy("addedAt").reverse().toArray(), [], []);
  const { busy, notice, setNotice, upload } = useHandoutUpload();
  const totalBytes = handouts.reduce((sum, file) => sum + file.size, 0);
  const recent = handouts.slice(0, 4);

  return (
    <div className="rr-page">
      <div className="rr-eyebrow"><span className="rr-eyebrow-line" /> THE STUDY DESK</div>
      <section className="rr-hero">
        <div className="rr-hero-intro">
          <h1>Make room<br />for <em>learning.</em></h1>
          <p>A quiet place for your nursing handouts, notes, and everything you're working toward.</p>
          <div className="rr-hero-actions">
            <UploadButton busy={busy} onFiles={(files) => void upload(files)} className="rr-button rr-button-primary"><Plus size={18} />{busy ? "Saving…" : "Add a handout"}</UploadButton>
            <Link to="/handouts" className="rr-text-link">Browse library <ArrowRight size={17} /></Link>
          </div>
        </div>
        <div className="rr-paper-note" aria-label="Study reminder">
          <span className="rr-note-number">A NOTE TO SELF / 01</span>
          <span className="rr-note-rule" />
          <p>Small steps<br />still move<br /><i>you forward.</i></p>
          <span className="rr-note-signature">ONE TOPIC AT A TIME <span>✳</span></span>
        </div>
      </section>
      <Alert text={notice} onDismiss={() => setNotice("")} />
      <section className="rr-stats" aria-label="Study library overview">
        <div className="rr-stat"><span>01 / Saved materials</span><strong>{handouts.length.toString().padStart(2, "0")}</strong><small>Handouts in your library</small></div>
        <div className="rr-stat"><span>02 / On-device files</span><strong>{formatSize(totalBytes)}</strong><small>Stored in this browser</small></div>
        <div className="rr-stat"><span>03 / Most recent</span><strong className="rr-stat-word">{recent.length ? formatDate(recent[0].addedAt) : "Not yet"}</strong><small>Last handout added</small></div>
      </section>

      <div className="rr-dashboard-grid">
        <section className="rr-section">
          <div className="rr-section-heading"><div><span className="rr-small-label">YOUR MATERIALS</span><h2>Recently added</h2></div><Link to="/handouts" className="rr-small-link">View all <ArrowRight size={15} /></Link></div>
          {handouts.length === 0 ? (
            <div className="rr-empty-recent"><FolderOpen size={30} strokeWidth={1.25} /><h3>Everything starts somewhere.</h3><p>Add your first handout and it will appear here, ready when you are.</p></div>
          ) : (
            <div className="rr-recent-list">{recent.map((item) => <div className="rr-recent-row" key={item.id}><FileSymbol name={item.name} /><div className="rr-recent-name"><strong title={item.name}>{item.name}</strong><span>{formatDate(item.addedAt)} · {formatSize(item.size)}</span></div><span className="rr-file-type">{getKind(item.name)}</span></div>)}</div>
          )}
        </section>
        <section className="rr-section rr-upcoming-section">
          <div className="rr-section-heading"><div><span className="rr-small-label">WHAT'S NEXT</span><h2>Your study flow</h2></div></div>
          <div className="rr-workflow">
            <div><span className="rr-step-num">01</span><div><strong>Collect your handouts</strong><p>Keep all of your study materials in one place.</p></div><Check size={17} className="rr-step-check" /></div>
            <div><span className="rr-step-num">02</span><div><strong>Understand every topic</strong><p>AI-assisted reviewers and explanations are coming next.</p></div><span className="rr-step-tag">PLANNED</span></div>
            <div><span className="rr-step-num">03</span><div><strong>Test what you know</strong><p>Practice quizzes and progress tracking will follow.</p></div><span className="rr-step-tag">PLANNED</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Library() {
  const handouts = useLiveQuery(() => db.handouts.orderBy("addedAt").reverse().toArray(), [], []);
  const { busy, notice, setNotice, upload } = useHandoutUpload();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const filtered = handouts.filter((h) => h.name.toLowerCase().includes(query.trim().toLowerCase()));

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files);
  }

 async function removeHandout(item: Handout) {
  if (!window.confirm(`Delete “${item.name}” from this device?`)) {
    return;
  }

  try {
    await db.transaction(
      "rw",
      db.handouts,
      db.handoutContents,
      async () => {
        await db.handoutContents.delete(item.id);
        await db.handouts.delete(item.id);
      },
    );

    setError("");
  } catch {
    setError("This file couldn't be deleted. Please try again.");
  }
}


  return (
    <div className="rr-page rr-library-page">
      <div className="rr-eyebrow"><span className="rr-eyebrow-line" /> YOUR PERSONAL COLLECTION</div>
      <div className="rr-library-heading">
        <div><h1>Your <em>library.</em></h1><p>All your nursing handouts, thoughtfully kept together.</p></div>
        <UploadButton busy={busy} onFiles={(files) => void upload(files)} className="rr-button rr-button-primary"><Plus size={18} />{busy ? "Saving…" : "Add files"}</UploadButton>
      </div>
      <Alert text={notice || error} onDismiss={() => { setNotice(""); setError(""); }} />

      <div
        className={`rr-dropzone ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={handleDrop}
      >
        <div className="rr-drop-icon"><UploadCloud size={24} strokeWidth={1.6} /></div>
        <div><strong>Drop your study materials here</strong><p>PDF, DOCX, JPG or PNG · Saved locally on this device</p></div>
        <UploadButton busy={busy} onFiles={(files) => void upload(files)} className="rr-button rr-button-outline">Choose files <ArrowRight size={16} /></UploadButton>
      </div>

      <section className="rr-library-list">
        <div className="rr-library-toolbar">
          <div className="rr-library-title"><h2>All handouts</h2><span>{handouts.length}</span></div>
          <label className="rr-search"><Search size={17} /><input type="search" placeholder="Search your files" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        {handouts.length === 0 ? (
          <div className="rr-library-empty"><LibraryBig size={36} strokeWidth={1.2} /><h3>Your shelves are waiting.</h3><p>Add a handout to get started. It will stay in this browser until you delete it or clear the browser's stored data.</p></div>
        ) : filtered.length === 0 ? (
          <div className="rr-library-empty"><Search size={34} strokeWidth={1.2} /><h3>No matching handouts.</h3><p>Try a different search term.</p></div>
        ) : (
          <div className="rr-library-items">
            {filtered.map((item) => (
              <div className="rr-library-item" key={item.id}>
                <FileSymbol name={item.name} />
                <div className="rr-library-file-details"><strong title={item.name}>{item.name}</strong><span>{getKind(item.name)} · {formatSize(item.size)} · Added {formatDate(item.addedAt)}</span></div>
                <div className="rr-library-actions">
                  <Link
                    to={`/handouts/${item.id}`}
                    className="rr-open-button"
                  >
                    Read
                    <ArrowRight size={15} />
                  </Link>
                  <button type="button" className="rr-icon-button" title={`Download ${item.name}`} aria-label={`Download ${item.name}`} onClick={() => saveAs(item.file, item.name)}><ArrowDownToLine size={18} /></button>
                  <button type="button" className="rr-icon-button rr-icon-button-danger" title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`} onClick={() => void removeHandout(item)}><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="rr-list-footer"><HardDrive size={15} /><span>Saved to this browser using IndexedDB. Back up important handouts separately.</span><CloudOff size={15} /></div>
      </section>
    </div>
  );
}

function NotFound() {
  return <div className="rr-not-found"><h1>Page not found.</h1><p>Looks like this page isn't part of your study space.</p><Link to="/" className="rr-button rr-button-primary">Back to study desk <ArrowRight size={16} /></Link></div>;
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>;
}
