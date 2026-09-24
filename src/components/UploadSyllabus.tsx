"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, errorMessage } from "@/lib/api";
import {
  COURSE_COLORS,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventType,
  type ParseResult,
} from "@/lib/types";

export type UploadCourseOption = {
  id: string;
  name: string;
  code: string | null;
  startDate?: string | null;
};

export type UploadSyllabusProps = {
  courses: UploadCourseOption[];
  /** Pre-selects the course when the panel sits on a course page. */
  courseId?: string;
  variant?: "hero" | "panel";
};

type ReviewRow = {
  id: string;
  include: boolean;
  title: string;
  type: EventType;
  dueDate: string;
  dueTime: string | null;
  notes: string | null;
  confidence: number;
};

type ParseResponse = ParseResult & { uploadId: string };

const ACCEPTED = ".pdf,.docx,.txt,.md,.markdown,.csv,.rtf,.html,.htm";

export function UploadSyllabus({ courses, courseId, variant = "panel" }: UploadSyllabusProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [target, setTarget] = useState<string>(courseId ?? "new");
  const [showText, setShowText] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    code: "",
    term: "",
    instructor: "",
    color: COURSE_COLORS[0] as string,
  });
  const [summary, setSummary] = useState<{ created: number; skipped: number; courseId: string } | null>(
    null,
  );

  const isHero = variant === "hero";

  async function handleFile(file: File) {
    setError(null);
    setSelectedFileName(file.name);
    setParsing(true);
    setSummary(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const anchor = courses.find((course) => course.id === target)?.startDate;
      if (anchor) form.append("anchorStart", anchor);

      const response = await fetch("/api/parse", { method: "POST", body: form });
      const payload = (await response.json()) as ParseResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "That file could not be parsed.");

      const detected = Array.isArray(payload.events) ? payload.events : [];
      setResult(payload);
      setRows(
        detected.map((event, index) => ({
          id: `${index}-${event.dueDate}-${event.title}`,
          include: true,
          title: event.title,
          type: event.type,
          dueDate: event.dueDate,
          dueTime: event.dueTime,
          notes: event.notes,
          confidence: event.confidence,
        })),
      );
      setDraft((current) => ({
        ...current,
        name: payload.course.name ?? current.name,
        code: payload.course.code ?? current.code,
        term: payload.course.term ?? current.term,
        instructor: payload.course.instructor ?? current.instructor,
      }));
      if (courseId) setTarget(courseId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function reset() {
    setResult(null);
    setRows([]);
    setSummary(null);
    setError(null);
    setSelectedFileName(null);
    setShowText(false);
  }

  async function importDeadlines() {
    if (!result) return;
    setImporting(true);
    setError(null);

    const events = rows
      .filter((row) => row.include)
      .map((row) => ({
        title: row.title.trim() || EVENT_TYPE_LABELS[row.type],
        type: row.type,
        dueDate: row.dueDate,
        dueTime: row.dueTime,
        notes: row.notes,
        confidence: row.confidence,
      }));

    try {
      let destination = target;

      if (target === "new") {
        destination = crypto.randomUUID();
      }

      const payload = await apiFetch<{ created: number; skipped: number }>(
        `/api/courses/${destination}/import`,
        {
          method: "POST",
          json: {
            uploadId: result.uploadId,
            events,
            course: {
              name: draft.name.trim() || result.course.name || "New course",
              code: draft.code.trim() || null,
              term: draft.term.trim() || null,
              instructor: draft.instructor.trim() || null,
              color: draft.color,
            },
          },
        },
      );

      setSummary({ created: payload.created, skipped: payload.skipped, courseId: destination });
      setResult(null);
      setRows([]);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setImporting(false);
    }
  }

  if (summary) {
    return (
      <div className="card p-5">
        <h2 className="text-base font-semibold">Calendar updated 🎉</h2>
        <p className="mt-1.5 text-sm text-muted">
          Added {summary.created} deadline{summary.created === 1 ? "" : "s"}
          {summary.skipped > 0 ? `, skipped ${summary.skipped} duplicate${summary.skipped === 1 ? "" : "s"}` : ""}
          . The syllabus was saved with the course.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn-primary" href={`/courses/${summary.courseId}`}>
            Open course
          </a>
          <button type="button" className="btn-ghost" onClick={reset}>
            Upload another syllabus
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={isHero ? "card p-6 sm:p-7" : "card p-5"}>
        {isHero ? (
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Turn a syllabus into a deadline calendar
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Drop in a PDF, Word document or text file. HopSyllabus reads the course
              details, finds every assignment, test, quiz and project deadline, then lets
              you review them before they land on your calendar.
            </p>
          </div>
        ) : null}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-brand bg-brand/10" : "border-line bg-canvas/40"
          }`}
        >
          <input
            ref={inputRef}
            id="syllabus-file-input"
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
            <svg viewBox="0 0 24 24" className="size-6 text-brand-soft" aria-hidden="true">
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"
                stroke="currentColor"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="mt-4 text-sm font-medium" aria-live="polite">
            {parsing ? "Reading your syllabus…" : selectedFileName ? `${selectedFileName} selected` : "Drag a syllabus here"}
          </p>
          <p className="mt-1 text-xs text-muted">PDF, DOCX, TXT or Markdown · up to 15 MB</p>
          <label
            htmlFor="syllabus-file-input"
            className={`btn-primary mt-4 ${parsing ? "pointer-events-none opacity-50" : ""}`}
          >
            {parsing ? "Parsing…" : "Choose file"}
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const included = rows.filter((row) => row.include).length;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Review detected deadlines</h2>
          <p className="mt-1 text-xs text-muted">
            {result.fileName} · {result.characters.toLocaleString()} characters read ·{" "}
            {rows.length} date{rows.length === 1 ? "" : "s"} found
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setShowText(!showText)}>
            {showText ? "Hide text" : "View extracted text"}
          </button>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={reset}>
            Cancel
          </button>
        </div>
      </div>

      {result.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {result.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      {showText ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-line bg-canvas/60 p-3 text-[0.7rem] whitespace-pre-wrap text-muted">
          {result.textPreview}
        </pre>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {included} of {rows.length} selected
        </span>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            onClick={() => setRows(rows.map((row) => ({ ...row, include: true })))}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            onClick={() => setRows(rows.map((row) => ({ ...row, include: false })))}
          >
            Clear
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3 text-sm text-muted">
          No deadlines were detected automatically. You can still save the course and add
          deadlines by hand.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead className="bg-surface-2/60 text-left text-[0.7rem] tracking-wide text-muted uppercase">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-2 py-2">Title</th>
                <th className="w-36 px-2 py-2">Type</th>
                <th className="w-40 px-2 py-2">Date</th>
                <th className="w-28 px-2 py-2">Time</th>
                <th className="w-16 px-2 py-2">Conf.</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((row, index) => (
                <tr key={row.id} className={row.include ? "" : "opacity-45"}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 cursor-pointer accent-indigo-500"
                      checked={row.include}
                      aria-label={`Include ${row.title}`}
                      onChange={() =>
                        setRows(
                          rows.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, include: !item.include } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      className="field py-1.5"
                      value={row.title}
                      onChange={(event) =>
                        setRows(
                          rows.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    {row.notes ? (
                      <p className="mt-1 line-clamp-1 text-[0.68rem] text-muted" title={row.notes}>
                        {row.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <select
                      className="field py-1.5"
                      value={row.type}
                      onChange={(event) =>
                        setRows(
                          rows.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, type: event.target.value as EventType }
                              : item,
                          ),
                        )
                      }
                    >
                      {EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {EVENT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="date"
                      className="field py-1.5"
                      value={row.dueDate}
                      onChange={(event) =>
                        setRows(
                          rows.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, dueDate: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="time"
                      className="field py-1.5"
                      value={row.dueTime ?? ""}
                      onChange={(event) =>
                        setRows(
                          rows.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, dueTime: event.target.value || null }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span
                      className={`chip ${
                        row.confidence >= 0.75
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                          : row.confidence >= 0.55
                            ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                            : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                      }`}
                      title={`Confidence ${Math.round(row.confidence * 100)}%`}
                    >
                      {Math.round(row.confidence * 100)}%
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      className="btn-icon hover:text-rose-300"
                      aria-label={`Remove ${row.title}`}
                      onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="field-label">Save to</span>
          <select
            className="field"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={Boolean(courseId)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code ? `${course.code} — ${course.name}` : course.name}
              </option>
            ))}
            <option value="new">➕ Create a new course</option>
          </select>
        </div>

        {target === "new" ? (
          <>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="draft-name">
                Course name
              </label>
              <input
                id="draft-name"
                className="field"
                value={draft.name}
                placeholder="Data Structures"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="draft-code">
                Course code
              </label>
              <input
                id="draft-code"
                className="field"
                value={draft.code}
                placeholder="CS 310"
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="draft-term">
                Term
              </label>
              <input
                id="draft-term"
                className="field"
                value={draft.term}
                placeholder="Fall 2026"
                onChange={(event) => setDraft({ ...draft, term: event.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="draft-instructor">
                Instructor
              </label>
              <input
                id="draft-instructor"
                className="field"
                value={draft.instructor}
                placeholder="Dr. Chen"
                onChange={(event) => setDraft({ ...draft, instructor: event.target.value })}
              />
            </div>
            <div>
              <span className="field-label">Colour</span>
              <div className="flex gap-2">
                {COURSE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use colour ${color}`}
                    onClick={() => setDraft({ ...draft, color })}
                    className={`size-7 rounded-lg border-2 ${
                      draft.color === color ? "border-ink" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Detected deadlines are marked so you can spot them. Nothing is saved until you
          confirm.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={importDeadlines}
          disabled={importing || (target === "new" && draft.name.trim() === "")}
        >
          {importing
            ? "Saving…"
            : `Import ${included} deadline${included === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
