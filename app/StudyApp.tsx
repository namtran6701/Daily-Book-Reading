"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type DailyNote = {
  id: string;
  noteDate: string;
  focus: string;
  learned: string;
  takeaways: string;
  questions: string;
  tomorrow: string;
  tags: string;
  minutes: number;
  createdAt: string;
  updatedAt: string;
};

type Draft = Pick<
  DailyNote,
  "focus" | "learned" | "takeaways" | "questions" | "tomorrow" | "tags" | "minutes"
>;

const EMPTY_DRAFT: Draft = {
  focus: "",
  learned: "",
  takeaways: "",
  questions: "",
  tomorrow: "",
  tags: "",
  minutes: 0,
};

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function shiftDate(value: string, days: number): string {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options).format(dateFromKey(value));
}

function toDraft(note: DailyNote): Draft {
  return {
    focus: note.focus,
    learned: note.learned,
    takeaways: note.takeaways,
    questions: note.questions,
    tomorrow: note.tomorrow,
    tags: note.tags,
    minutes: note.minutes,
  };
}

function calculateStreak(notes: DailyNote[]): number {
  const dates = new Set(notes.map((note) => note.noteDate));
  const today = localDateKey();
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function StudyApp() {
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [newDate, setNewDate] = useState(localDateKey());
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);

  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const today = localDateKey();

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/daily-notes", { cache: "no-store" });
      const payload = (await response.json()) as { notes?: DailyNote[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load your learning log.");
      const rows = payload.notes ?? [];
      setNotes(rows);
      setSelectedId((current) => {
        if (current && rows.some((note) => note.id === current)) return current;
        return rows.find((note) => note.noteDate === today)?.id ?? rows[0]?.id ?? null;
      });
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your learning log.");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!selected) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    setDraft(toDraft(selected));
    revisionRef.current += 1;
    savedRevisionRef.current = revisionRef.current;
    setSaving("idle");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistDraft = useCallback(
    async (snapshot: Draft, revision: number) => {
      if (!selectedId) return;
      setSaving("saving");
      try {
        const response = await fetch("/api/daily-notes", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: selectedId, ...snapshot }),
        });
        const payload = (await response.json()) as { note?: DailyNote; error?: string };
        if (!response.ok || !payload.note) {
          throw new Error(payload.error ?? "Your changes could not be saved.");
        }
        setNotes((current) =>
          current
            .map((note) => (note.id === payload.note?.id ? payload.note : note))
            .sort((a, b) => b.noteDate.localeCompare(a.noteDate)),
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
    const timer = window.setTimeout(() => void persistDraft(draft, revision), 850);
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

  async function openDate(noteDate: string) {
    const existing = notes.find((note) => note.noteDate === noteDate);
    if (existing) {
      setSelectedId(existing.id);
      setMenuOpen(false);
      setDateModalOpen(false);
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/daily-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteDate }),
      });
      const payload = (await response.json()) as { note?: DailyNote; error?: string };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Could not create the daily note.");
      }
      setNotes((current) => {
        const withoutDuplicate = current.filter((note) => note.id !== payload.note?.id);
        return [payload.note!, ...withoutDuplicate].sort((a, b) => b.noteDate.localeCompare(a.noteDate));
      });
      setSelectedId(payload.note.id);
      setDateModalOpen(false);
      setMenuOpen(false);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not create the daily note.");
    } finally {
      setCreating(false);
    }
  }

  async function createSelectedDate(event: FormEvent) {
    event.preventDefault();
    await openDate(newDate);
  }

  async function deleteNote() {
    if (!selected || !window.confirm(`Delete your note for ${formatDate(selected.noteDate, { month: "long", day: "numeric" })}? This cannot be undone.`)) return;
    const response = await fetch(`/api/daily-notes?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    if (!response.ok) return;
    const remaining = notes.filter((note) => note.id !== selected.id);
    setNotes(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  const stats = useMemo(() => {
    const weekStart = shiftDate(today, -6);
    return {
      streak: calculateStreak(notes),
      days: notes.length,
      thisWeek: notes.filter((note) => note.noteDate >= weekStart && note.noteDate <= today).length,
      minutes: notes.reduce((total, note) => total + note.minutes, 0),
    };
  }, [notes, today]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return notes;
    return notes.filter((note) =>
      [note.noteDate, note.focus, note.learned, note.takeaways, note.questions, note.tomorrow, note.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [notes, query]);

  const groups = useMemo(() => {
    const result = new Map<string, DailyNote[]>();
    for (const note of filtered) {
      const month = formatDate(note.noteDate, { month: "long", year: "numeric" });
      const rows = result.get(month) ?? [];
      rows.push(note);
      result.set(month, rows);
    }
    return result;
  }, [filtered]);

  return (
    <main className="app-shell" data-app="daily-learning-log">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open daily notes">☰</button>
        <span className="mobile-brand"><span className="brand-mark">DL</span> Daily Log</span>
        <button className="mobile-add" onClick={() => setDateModalOpen(true)} aria-label="New daily note">＋</button>
      </header>

      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close daily notes" />}

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark">DL</span>
          <div><strong>Daily Log</strong><span>Cloud Architect</span></div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close daily notes">×</button>
        </div>

        <section className="progress-card" aria-label="Learning consistency">
          <div className="streak-line"><strong>{stats.streak}</strong><span>day streak</span></div>
          <div className="stat-row">
            <span><strong>{stats.days}</strong> Days</span>
            <span><strong>{stats.thisWeek}</strong> This week</span>
            <span><strong>{Math.round(stats.minutes / 60)}</strong> Hours</span>
          </div>
        </section>

        <button className="new-button" onClick={() => void openDate(today)}>
          <span>＋</span> Today&apos;s note
        </button>
        <button className="date-button" onClick={() => { setNewDate(today); setDateModalOpen(true); }}>Choose another date</button>

        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your learning" aria-label="Search your learning" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <nav className="chapter-list" aria-label="Daily learning notes">
          {loading ? (
            <div className="list-message">Opening your learning log…</div>
          ) : filtered.length === 0 ? (
            <div className="list-message">{notes.length ? "No entries match your search." : "Your daily notes will appear here."}</div>
          ) : (
            Array.from(groups).map(([month, rows]) => (
              <section key={month} className="chapter-group">
                <h2>{month}</h2>
                {rows.map((note) => (
                  <button
                    key={note.id}
                    className={`chapter-item daily-item ${selectedId === note.id ? "active" : ""}`}
                    onClick={() => { setSelectedId(note.id); setMenuOpen(false); }}
                  >
                    <span className="date-tile">
                      <small>{formatDate(note.noteDate, { weekday: "short" })}</small>
                      <strong>{formatDate(note.noteDate, { day: "2-digit" })}</strong>
                    </span>
                    <span className="chapter-copy">
                      <strong>{note.focus || "Untitled learning day"}</strong>
                      <small>{note.noteDate === today ? "Today" : note.minutes ? `${note.minutes} min studied` : "Daily note"}</small>
                    </span>
                  </button>
                ))}
              </section>
            ))
          )}
        </nav>
      </aside>

      <section className="workspace">
        {loadError && (
          <div className="error-banner"><span>{loadError}</span><button onClick={() => void loadNotes()}>Try again</button></div>
        )}

        {!selected ? (
          <section className="welcome-panel">
            <div className="welcome-date" aria-hidden="true">
              <span>{formatDate(today, { weekday: "long" })}</span>
              <strong>{formatDate(today, { day: "2-digit" })}</strong>
            </div>
            <p className="eyebrow">A quiet record of your progress</p>
            <h1>What did you learn today?</h1>
            <p>Write a little each day. Capture what clicked, what is still unclear, and where you want to continue tomorrow.</p>
            <button onClick={() => void openDate(today)}>Write today&apos;s note <span>→</span></button>
            <div className="welcome-steps">
              <span><b>01</b> Learn</span><span><b>02</b> Reflect</span><span><b>03</b> Continue</span>
            </div>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div className="breadcrumb"><span>Daily learning</span><b>/</b><span>{selected.noteDate}</span></div>
              <div className="save-state" role="status">
                <span className={`save-dot ${saving}`} />
                {saving === "saving" ? "Saving…" : saving === "error" ? "Save failed" : saving === "saved" ? "Saved" : "Autosave on"}
              </div>
            </header>

            <div className="editor-wrap daily-editor">
              <div className="note-heading">
                <div className="date-line">
                  <span>{formatDate(selected.noteDate, { weekday: "long" })}</span>
                  {selected.noteDate === today && <b>Today</b>}
                </div>
                <h1 className="daily-date-title">{formatDate(selected.noteDate, { month: "long", day: "numeric", year: "numeric" })}</h1>
                <input
                  className="summary-input daily-focus-input"
                  value={draft.focus}
                  onChange={(event) => updateDraft("focus", event.target.value)}
                  placeholder="Give today a short title — what was your main focus?"
                  aria-label="Main learning focus"
                />
              </div>

              <div className="note-toolbar daily-toolbar">
                <span>Daily reflection</span>
                <button className="more-button" onClick={() => void deleteNote()} aria-label="Delete daily note">Delete</button>
              </div>

              <div className="notes-grid daily-grid">
                <section className="field-card wide learning-card">
                  <div className="field-heading"><span className="field-number">01</span><div><h2>What I learned</h2><p>Write freely. Explain it as if you were teaching someone else.</p></div></div>
                  <textarea
                    value={draft.learned}
                    onChange={(event) => updateDraft("learned", event.target.value)}
                    placeholder="Today I learned…"
                    rows={14}
                    aria-label="What I learned today"
                  />
                </section>

                <section className="field-card">
                  <div className="field-heading"><span className="field-number">02</span><div><h2>Key takeaways</h2><p>The few ideas worth remembering.</p></div></div>
                  <textarea value={draft.takeaways} onChange={(event) => updateDraft("takeaways", event.target.value)} placeholder={"• The main idea\n• A useful detail\n• A connection I noticed"} rows={8} aria-label="Key takeaways" />
                </section>

                <section className="field-card">
                  <div className="field-heading"><span className="field-number">03</span><div><h2>Still unclear</h2><p>Questions to research or ask later.</p></div></div>
                  <textarea value={draft.questions} onChange={(event) => updateDraft("questions", event.target.value)} placeholder={"• Why does…?\n• How is this different from…?"} rows={8} aria-label="Questions still unclear" />
                </section>

                <section className="field-card wide tomorrow-card">
                  <div className="field-heading"><span className="field-number">04</span><div><h2>Tomorrow&apos;s focus</h2><p>Leave yourself one clear place to continue.</p></div></div>
                  <textarea value={draft.tomorrow} onChange={(event) => updateDraft("tomorrow", event.target.value)} placeholder="Tomorrow, I want to continue with…" rows={4} aria-label="Tomorrow's focus" />
                </section>

                <section className="details-row wide daily-details">
                  <label><span>Tags</span><input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="networking, iam, storage" /></label>
                  <label><span>Minutes studied</span><input type="number" min="0" max="1440" value={draft.minutes || ""} onChange={(event) => updateDraft("minutes", Math.max(0, Number(event.target.value) || 0))} placeholder="0" /></label>
                </section>
              </div>
            </div>
          </>
        )}
      </section>

      {dateModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDateModalOpen(false)}>
          <form className="create-modal" onSubmit={createSelectedDate}>
            <button type="button" className="modal-close" onClick={() => setDateModalOpen(false)} aria-label="Close">×</button>
            <span className="modal-kicker">Daily learning note</span>
            <h2>Choose a date</h2>
            <p>There is one learning note for each day. Choosing an existing date opens that entry.</p>
            <label><span>Date</span><input autoFocus type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} required /></label>
            <div className="modal-actions"><button type="button" onClick={() => setDateModalOpen(false)}>Cancel</button><button type="submit" disabled={creating || !newDate}>{creating ? "Opening…" : "Open daily note"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
