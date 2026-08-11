"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Chapter = {
  id: string;
  title: string;
  section: string;
  summary: string;
  content: string;
  keyTakeaways: string;
  examTraps: string;
  recallQuestions: string;
  tags: string;
  status: "learning" | "reviewing" | "mastered";
  confidence: number;
  reviewCount: number;
  lastReviewed: string | null;
  nextReview: string;
  createdAt: string;
  updatedAt: string;
};

type Draft = Pick<
  Chapter,
  | "title"
  | "section"
  | "summary"
  | "content"
  | "keyTakeaways"
  | "examTraps"
  | "recallQuestions"
  | "tags"
  | "status"
  | "confidence"
>;

const STATUS_LABELS = {
  learning: "Learning",
  reviewing: "Reviewing",
  mastered: "Mastered",
};

const EMPTY_DRAFT: Draft = {
  title: "",
  section: "General",
  summary: "",
  content: "",
  keyTakeaways: "",
  examTraps: "",
  recallQuestions: "",
  tags: "",
  status: "learning",
  confidence: 1,
};

function toDraft(chapter: Chapter): Draft {
  return {
    title: chapter.title,
    section: chapter.section,
    summary: chapter.summary,
    content: chapter.content,
    keyTakeaways: chapter.keyTakeaways,
    examTraps: chapter.examTraps,
    recallQuestions: chapter.recallQuestions,
    tags: chapter.tags,
    status: chapter.status,
    confidence: chapter.confidence,
  };
}

function isDue(chapter: Chapter): boolean {
  return chapter.nextReview <= new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) return "Not reviewed yet";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() !== new Date().getFullYear()
      ? "numeric"
      : undefined,
  }).format(new Date(`${value}T12:00:00`));
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

export function StudyApp() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "due" | "mastered">("all");
  const [activeTab, setActiveTab] = useState<"notes" | "review">("notes");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSection, setNewSection] = useState("Cloud fundamentals");
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewConfidence, setReviewConfidence] = useState(3);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);

  const selected = chapters.find((chapter) => chapter.id === selectedId) ?? null;

  const loadChapters = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/chapters", { cache: "no-store" });
      const payload = (await response.json()) as { chapters?: Chapter[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load your chapters.");
      const rows = payload.chapters ?? [];
      setChapters(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your chapters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  useEffect(() => {
    if (!selected) return;
    setDraft(toDraft(selected));
    revisionRef.current += 1;
    savedRevisionRef.current = revisionRef.current;
    setSaving("idle");
    setRevealed(false);
    setReviewConfidence(Math.max(1, selected.confidence));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistDraft = useCallback(
    async (snapshot: Draft, revision: number) => {
      if (!selectedId || !snapshot.title.trim()) return;
      setSaving("saving");
      try {
        const response = await fetch("/api/chapters", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: selectedId, ...snapshot }),
        });
        const payload = (await response.json()) as { chapter?: Chapter; error?: string };
        if (!response.ok || !payload.chapter) {
          throw new Error(payload.error ?? "Your changes could not be saved.");
        }
        setChapters((current) =>
          current.map((chapter) =>
            chapter.id === payload.chapter?.id ? payload.chapter : chapter,
          ),
        );
        savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
        if (revisionRef.current === revision) setSaving("saved");
      } catch {
        setSaving("error");
      }
    },
    [selectedId],
  );

  useEffect(() => {
    const revision = revisionRef.current;
    if (!selectedId || revision <= savedRevisionRef.current) return;
    const timer = window.setTimeout(() => void persistDraft(draft, revision), 900);
    return () => window.clearTimeout(timer);
  }, [draft, persistDraft, selectedId]);

  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistDraft(draft, revisionRef.current);
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [draft, persistDraft]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    revisionRef.current += 1;
    setSaving("idle");
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function createChapter(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/chapters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle, section: newSection }),
      });
      const payload = (await response.json()) as { chapter?: Chapter; error?: string };
      if (!response.ok || !payload.chapter) {
        throw new Error(payload.error ?? "Could not create the chapter.");
      }
      setChapters((current) => [payload.chapter!, ...current]);
      setSelectedId(payload.chapter.id);
      setCreateOpen(false);
      setNewTitle("");
      setActiveTab("notes");
      setMenuOpen(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not create the chapter.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteChapter() {
    if (!selected || !window.confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    const response = await fetch(`/api/chapters?id=${encodeURIComponent(selected.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    const remaining = chapters.filter((chapter) => chapter.id !== selected.id);
    setChapters(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  async function completeReview() {
    if (!selected) return;
    setSaving("saving");
    try {
      const response = await fetch("/api/chapters", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          action: "review",
          confidence: reviewConfidence,
        }),
      });
      const payload = (await response.json()) as { chapter?: Chapter; error?: string };
      if (!response.ok || !payload.chapter) throw new Error(payload.error ?? "Review failed.");
      setChapters((current) =>
        current.map((chapter) => (chapter.id === payload.chapter?.id ? payload.chapter : chapter)),
      );
      setDraft(toDraft(payload.chapter));
      setSaving("saved");
      setRevealed(false);
      setActiveTab("notes");
    } catch {
      setSaving("error");
    }
  }

  const stats = useMemo(
    () => ({
      total: chapters.length,
      due: chapters.filter(isDue).length,
      mastered: chapters.filter((chapter) => chapter.confidence >= 4).length,
    }),
    [chapters],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return chapters.filter((chapter) => {
      const matchesQuery =
        !normalized ||
        [chapter.title, chapter.section, chapter.summary, chapter.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesFilter =
        filter === "all" ||
        (filter === "due" && isDue(chapter)) ||
        (filter === "mastered" && chapter.confidence >= 4);
      return matchesQuery && matchesFilter;
    });
  }, [chapters, filter, query]);

  const groups = useMemo(() => {
    const result = new Map<string, Chapter[]>();
    for (const chapter of filtered) {
      const rows = result.get(chapter.section) ?? [];
      rows.push(chapter);
      result.set(chapter.section, rows);
    }
    return result;
  }, [filtered]);

  const questions = parseLines(draft.recallQuestions);

  return (
    <main className="app-shell" data-app="cloud-architect-study-hub">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open chapters">
          ☰
        </button>
        <span className="mobile-brand"><span className="brand-mark">CA</span> Study Hub</span>
        <button className="mobile-add" onClick={() => setCreateOpen(true)} aria-label="New chapter">＋</button>
      </header>

      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close chapters" />}

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark">CA</span>
          <div>
            <strong>Study Hub</strong>
            <span>Cloud Architect</span>
          </div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close chapters">×</button>
        </div>

        <section className="progress-card" aria-label="Study progress">
          <div className="progress-copy">
            <span>Your progress</span>
            <strong>{stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0}%</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${stats.total ? (stats.mastered / stats.total) * 100 : 0}%` }} /></div>
          <div className="stat-row">
            <span><strong>{stats.total}</strong> Chapters</span>
            <span><strong>{stats.due}</strong> Due</span>
            <span><strong>{stats.mastered}</strong> Strong</span>
          </div>
        </section>

        <button className="new-button" onClick={() => setCreateOpen(true)}>
          <span>＋</span> New chapter
        </button>

        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your notes" aria-label="Search your notes" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <div className="filter-tabs" aria-label="Chapter filters">
          {(["all", "due", "mastered"] as const).map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : item === "due" ? `Due ${stats.due || ""}` : "Strong"}
            </button>
          ))}
        </div>

        <nav className="chapter-list" aria-label="Your chapters">
          {loading ? (
            <div className="list-message">Gathering your chapters…</div>
          ) : filtered.length === 0 ? (
            <div className="list-message">{chapters.length ? "No chapters match this view." : "Your first chapter will appear here."}</div>
          ) : (
            Array.from(groups).map(([section, rows]) => (
              <section key={section} className="chapter-group">
                <h2>{section}</h2>
                {rows.map((chapter) => (
                  <button
                    key={chapter.id}
                    className={`chapter-item ${selectedId === chapter.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedId(chapter.id);
                      setActiveTab("notes");
                      setMenuOpen(false);
                    }}
                  >
                    <span className={`confidence-dot confidence-${chapter.confidence}`} />
                    <span className="chapter-copy">
                      <strong>{chapter.title}</strong>
                      <small>{isDue(chapter) ? "Review due" : `Review ${formatDate(chapter.nextReview)}`}</small>
                    </span>
                    {isDue(chapter) && <span className="due-pip" />}
                  </button>
                ))}
              </section>
            ))
          )}
        </nav>
      </aside>

      <section className="workspace">
        {loadError && (
          <div className="error-banner">
            <span>{loadError}</span>
            <button onClick={() => void loadChapters()}>Try again</button>
          </div>
        )}

        {!selected ? (
          <section className="welcome-panel">
            <div className="welcome-icon" aria-hidden="true">CA</div>
            <p className="eyebrow">Cloud Architect Study Hub</p>
            <h1>Turn every chapter into knowledge that sticks.</h1>
            <p>Capture the big picture, test yourself from memory, and review each topic right before it fades.</p>
            <button onClick={() => setCreateOpen(true)}>Create your first chapter <span>→</span></button>
            <div className="welcome-steps">
              <span><b>01</b> Capture</span>
              <span><b>02</b> Recall</span>
              <span><b>03</b> Review</span>
            </div>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div className="breadcrumb"><span>{selected.section}</span><b>/</b><span>Chapter note</span></div>
              <div className="save-state" role="status">
                <span className={`save-dot ${saving}`} />
                {saving === "saving" ? "Saving…" : saving === "error" ? "Save failed" : saving === "saved" ? "Saved" : "Autosave on"}
              </div>
            </header>

            <div className="editor-wrap">
              <div className="note-heading">
                <div className="status-line">
                  <span className={`status-chip ${draft.status}`}>{STATUS_LABELS[draft.status]}</span>
                  {isDue(selected) ? <span className="due-label">Review due today</span> : <span className="next-label">Next review · {formatDate(selected.nextReview)}</span>}
                </div>
                <input
                  className="title-input"
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  aria-label="Chapter title"
                />
                <input
                  className="summary-input"
                  value={draft.summary}
                  onChange={(event) => updateDraft("summary", event.target.value)}
                  placeholder="In one sentence, what is this chapter really about?"
                  aria-label="One-sentence summary"
                />
              </div>

              <div className="note-toolbar">
                <div className="view-tabs">
                  <button className={activeTab === "notes" ? "active" : ""} onClick={() => setActiveTab("notes")}>Chapter notes</button>
                  <button className={activeTab === "review" ? "active" : ""} onClick={() => setActiveTab("review")}>
                    Review mode {isDue(selected) && <span />}
                  </button>
                </div>
                <div className="toolbar-actions">
                  <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as Draft["status"])} aria-label="Learning status">
                    <option value="learning">Learning</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="mastered">Mastered</option>
                  </select>
                  <button className="more-button" onClick={() => void deleteChapter()} aria-label="Delete chapter">Delete</button>
                </div>
              </div>

              {activeTab === "notes" ? (
                <div className="notes-grid">
                  <section className="field-card wide">
                    <div className="field-heading"><span className="field-number">01</span><div><h2>Big picture</h2><p>Explain it in your own words.</p></div></div>
                    <textarea
                      value={draft.content}
                      onChange={(event) => updateDraft("content", event.target.value)}
                      placeholder="What problem does this solve? How do the parts work together? Add examples, commands, or a simple architecture flow…"
                      rows={10}
                      aria-label="Big picture notes"
                    />
                  </section>

                  <section className="field-card">
                    <div className="field-heading"><span className="field-number gold">02</span><div><h2>Key takeaways</h2><p>The ideas worth carrying forward.</p></div></div>
                    <textarea value={draft.keyTakeaways} onChange={(event) => updateDraft("keyTakeaways", event.target.value)} placeholder={"- Main concept\n- Important trade-off\n- When to use it"} rows={8} aria-label="Key takeaways" />
                  </section>

                  <section className="field-card">
                    <div className="field-heading"><span className="field-number coral">03</span><div><h2>Exam traps</h2><p>Easy confusions and warning words.</p></div></div>
                    <textarea value={draft.examTraps} onChange={(event) => updateDraft("examTraps", event.target.value)} placeholder={"Do not confuse…\nWatch for wording like…\nCommon mistake…"} rows={8} aria-label="Exam traps" />
                  </section>

                  <section className="field-card wide recall-card">
                    <div className="field-heading"><span className="field-number violet">04</span><div><h2>Recall questions</h2><p>Questions future-you should answer without looking above.</p></div></div>
                    <textarea value={draft.recallQuestions} onChange={(event) => updateDraft("recallQuestions", event.target.value)} placeholder={"1. What problem does this solve?\n2. When would I choose it over an alternative?\n3. What limitation or cost should I remember?"} rows={6} aria-label="Recall questions" />
                  </section>

                  <section className="details-row wide">
                    <label><span>Section</span><input value={draft.section} onChange={(event) => updateDraft("section", event.target.value)} /></label>
                    <label><span>Tags</span><input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="security, iam, policies" /></label>
                    <label><span>Confidence</span><select value={draft.confidence} onChange={(event) => updateDraft("confidence", Number(event.target.value))}>{[1, 2, 3, 4, 5].map((score) => <option value={score} key={score}>{score} / 5</option>)}</select></label>
                  </section>
                </div>
              ) : (
                <section className="review-panel">
                  <div className="review-intro">
                    <p className="eyebrow">Active recall</p>
                    <h2>What can you explain without your notes?</h2>
                    <p>Answer aloud or on paper. Struggling a little is part of what makes the memory stronger.</p>
                  </div>

                  <div className="question-stack">
                    {(questions.length ? questions : [
                      "What problem does this chapter solve?",
                      "How does it work at a high level?",
                      "What trade-off or limitation matters most?",
                    ]).map((question, index) => (
                      <div className="question-row" key={`${question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></div>
                    ))}
                  </div>

                  {!revealed ? (
                    <button className="reveal-button" onClick={() => setRevealed(true)}>Reveal my notes</button>
                  ) : (
                    <div className="revealed-notes">
                      <div className="answer-sheet">
                        <p className="eyebrow">Memory check</p>
                        <h3>{draft.summary || draft.title}</h3>
                        <p className="preserve-lines">{draft.content || "No big-picture notes yet."}</p>
                        {draft.keyTakeaways && <div className="takeaway-box"><strong>Key takeaways</strong><p className="preserve-lines">{draft.keyTakeaways}</p></div>}
                      </div>
                      <div className="confidence-check">
                        <h3>How well could you explain it?</h3>
                        <div className="confidence-options">
                          {[1, 2, 3, 4, 5].map((score) => (
                            <button key={score} className={reviewConfidence === score ? "active" : ""} onClick={() => setReviewConfidence(score)}><strong>{score}</strong><span>{score === 1 ? "Lost" : score === 2 ? "Fuzzy" : score === 3 ? "Got it" : score === 4 ? "Strong" : "Teach it"}</span></button>
                          ))}
                        </div>
                        <button className="complete-button" onClick={() => void completeReview()}>Complete review <span>→</span></button>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </section>

      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}>
          <form className="create-modal" onSubmit={createChapter}>
            <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} aria-label="Close">×</button>
            <span className="modal-kicker">New chapter</span>
            <h2>What are you learning?</h2>
            <p>Start with the chapter title. You can shape the rest as you study.</p>
            <label><span>Chapter title</span><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Shared responsibility model" required /></label>
            <label><span>Section or domain</span><input value={newSection} onChange={(event) => setNewSection(event.target.value)} placeholder="e.g. Cloud fundamentals" /></label>
            <div className="modal-actions"><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" disabled={creating || !newTitle.trim()}>{creating ? "Creating…" : "Create chapter"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
