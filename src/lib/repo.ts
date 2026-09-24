import { randomUUID } from "node:crypto";

import { query, run, transaction, type QueryFn } from "./db";
import {
  COURSE_COLORS,
  EVENT_TYPES,
  type Course,
  type CourseEvent,
  type CourseSummary,
  type EventType,
} from "./types";

type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  term: string | null;
  color: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  course_id: string;
  title: string;
  type: string;
  due_date: string;
  due_time: string | null;
  notes: string | null;
  confidence: number;
  source: string;
  completed: number;
  created_at: string;
};

function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    instructor: row.instructor,
    term: row.term,
    color: row.color,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

function toEvent(row: EventRow): CourseEvent {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    type: (EVENT_TYPES as readonly string[]).includes(row.type)
      ? (row.type as EventType)
      : "other",
    dueDate: row.due_date,
    dueTime: row.due_time,
    notes: row.notes,
    confidence: row.confidence,
    source: row.source === "parsed" ? "parsed" : "manual",
    completed: row.completed === 1,
    createdAt: row.created_at,
  };
}

const EVENT_ORDER = `ORDER BY due_date ASC, COALESCE(due_time, '99:99') ASC, created_at ASC`;
const COURSE_SELECT = `SELECT id, name, code, instructor, term, color, start_date, end_date, created_at FROM courses`;

function eventSelect(): string {
  return `SELECT id, course_id, title, type, due_date, due_time, notes, confidence, source, completed, created_at FROM events`;
}

/* ---------------------------------- courses --------------------------------- */

export async function listCourses(): Promise<Course[]> {
  const rows = await query<CourseRow>(`${COURSE_SELECT} ORDER BY created_at ASC`);
  return rows.map(toCourse);
}

export async function listCourseSummaries(): Promise<CourseSummary[]> {
  const courses = await listCourses();
  if (courses.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const counts = await query<{ course_id: string; total: number | string }>(
    `SELECT course_id, COUNT(*) AS total FROM events GROUP BY course_id`,
  );
  const countByCourse = new Map(counts.map((r) => [r.course_id, Number(r.total)]));

  const nextRows = await query<{
    course_id: string;
    id: string;
    title: string;
    type: string;
    due_date: string;
  }>(
      `SELECT course_id, id, title, type, due_date FROM events
       WHERE due_date >= ?
       ORDER BY due_date ASC, COALESCE(due_time, '99:99') ASC`,
    [today],
  );

  const nextByCourse = new Map<string, CourseSummary["nextEvent"]>();
  for (const row of nextRows) {
    if (nextByCourse.has(row.course_id)) continue;
    nextByCourse.set(row.course_id, {
      id: row.id,
      title: row.title,
      type: (EVENT_TYPES as readonly string[]).includes(row.type)
        ? (row.type as EventType)
        : "other",
      dueDate: row.due_date,
    });
  }

  return courses.map((course) => ({
    ...course,
    eventCount: countByCourse.get(course.id) ?? 0,
    nextEvent: nextByCourse.get(course.id) ?? null,
  }));
}

export async function getCourse(id: string): Promise<Course | null> {
  const rows = await query<CourseRow>(`${COURSE_SELECT} WHERE id = ?`, [id]);
  return rows[0] ? toCourse(rows[0]) : null;
}

export type CourseInput = {
  id?: string;
  name: string;
  code?: string | null;
  instructor?: string | null;
  term?: string | null;
  color?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export async function createCourse(input: CourseInput): Promise<Course> {
  const id = input.id ?? randomUUID();
  const color =
    input.color ??
    COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)];
  await run(
      `INSERT INTO courses (id, name, code, instructor, term, color, start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.code ?? null,
      input.instructor ?? null,
      input.term ?? null,
      color,
      input.startDate ?? null,
      input.endDate ?? null,
      new Date().toISOString(),
    ],
  );
  return (await getCourse(id))!;
}

export async function updateCourse(
  id: string,
  patch: Partial<CourseInput>,
): Promise<Course | null> {
  const existing = await getCourse(id);
  if (!existing) return null;

  const merged: Course = {
    ...existing,
    name: patch.name ?? existing.name,
    code: patch.code === undefined ? existing.code : patch.code,
    instructor:
      patch.instructor === undefined ? existing.instructor : patch.instructor,
    term: patch.term === undefined ? existing.term : patch.term,
    color: patch.color ?? existing.color,
    startDate:
      patch.startDate === undefined ? existing.startDate : patch.startDate,
    endDate: patch.endDate === undefined ? existing.endDate : patch.endDate,
  };

  await run(
      `UPDATE courses SET name = ?, code = ?, instructor = ?, term = ?, color = ?, start_date = ?, end_date = ? WHERE id = ?`,
    [
      merged.name,
      merged.code,
      merged.instructor,
      merged.term,
      merged.color,
      merged.startDate,
      merged.endDate,
      id,
    ],
  );
  return getCourse(id);
}

export async function deleteCourse(id: string): Promise<boolean> {
  return (await run(`DELETE FROM courses WHERE id = ?`, [id])) > 0;
}

/* ---------------------------------- events ---------------------------------- */

export async function listEvents(courseId?: string): Promise<CourseEvent[]> {
  const rows = courseId
    ? await query<EventRow>(`${eventSelect()} WHERE course_id = ? ${EVENT_ORDER}`, [courseId])
    : await query<EventRow>(`${eventSelect()} ${EVENT_ORDER}`);
  return rows.map(toEvent);
}

export async function listEventsForCourses(courseIds: string[]): Promise<CourseEvent[]> {
  if (courseIds.length === 0) return [];
  const placeholders = courseIds.map(() => "?").join(", ");
  const rows = await query<EventRow>(
    `${eventSelect()} WHERE course_id IN (${placeholders}) ${EVENT_ORDER}`,
    courseIds,
  );
  return rows.map(toEvent);
}

export type EventInput = {
  courseId: string;
  title: string;
  type: EventType;
  dueDate: string;
  dueTime?: string | null;
  notes?: string | null;
  confidence?: number;
  source?: "parsed" | "manual";
};

async function insertEvent(execute: QueryFn, input: EventInput): Promise<string> {
  const id = randomUUID();
  await execute(
      `INSERT INTO events (id, course_id, title, type, due_date, due_time, notes, confidence, source, completed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      input.courseId,
      input.title,
      input.type,
      input.dueDate,
      input.dueTime ?? null,
      input.notes ?? null,
      input.confidence ?? 1,
      input.source ?? "manual",
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function createEvent(input: EventInput): Promise<CourseEvent> {
  const id = await transaction((execute) => insertEvent(execute, input));
  return (await getEvent(id))!;
}

export async function createEvents(inputs: EventInput[]): Promise<CourseEvent[]> {
  if (inputs.length === 0) return [];
  const ids = await transaction((execute) =>
    Promise.all(inputs.map((input) => insertEvent(execute, input))),
  );
  return Promise.all(ids.map(async (id) => (await getEvent(id))!));
}

export async function getEvent(id: string): Promise<CourseEvent | null> {
  const rows = await query<EventRow>(`${eventSelect()} WHERE id = ?`, [id]);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function updateEvent(
  id: string,
  patch: {
    title?: string;
    type?: EventType;
    dueDate?: string;
    dueTime?: string | null;
    notes?: string | null;
    completed?: boolean;
  },
): Promise<CourseEvent | null> {
  const existing = await getEvent(id);
  if (!existing) return null;

  const merged = {
    title: patch.title ?? existing.title,
    type: patch.type ?? existing.type,
    dueDate: patch.dueDate ?? existing.dueDate,
    dueTime: patch.dueTime === undefined ? existing.dueTime : patch.dueTime,
    notes: patch.notes === undefined ? existing.notes : patch.notes,
    completed: patch.completed ?? existing.completed,
  };

  await run(
      `UPDATE events SET title = ?, type = ?, due_date = ?, due_time = ?, notes = ?, completed = ? WHERE id = ?`,
    [
      merged.title,
      merged.type,
      merged.dueDate,
      merged.dueTime,
      merged.notes,
      merged.completed ? 1 : 0,
      id,
    ],
  );
  return getEvent(id);
}

export async function deleteEvent(id: string): Promise<boolean> {
  return (await run(`DELETE FROM events WHERE id = ?`, [id])) > 0;
}

/* ------------------------------- syllabus files ------------------------------ */

export type SyllabusFile = {
  id: string;
  courseId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export async function saveSyllabusFile(input: {
  courseId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  text: string;
}): Promise<SyllabusFile> {
  const id = randomUUID();
  const uploadedAt = new Date().toISOString();
  await run(
      `INSERT INTO syllabus_files (id, course_id, filename, file_type, size_bytes, text, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.courseId,
      input.filename,
      input.fileType,
      input.sizeBytes,
      input.text,
      uploadedAt,
    ],
  );
  return { id, uploadedAt, ...input };
}

export async function listSyllabusFiles(courseId: string): Promise<SyllabusFile[]> {
  const rows = await query<{
    id: string;
    course_id: string;
    filename: string;
    file_type: string;
    size_bytes: number;
    uploaded_at: string;
  }>(
      `SELECT id, course_id, filename, file_type, size_bytes, uploaded_at
       FROM syllabus_files WHERE course_id = ? ORDER BY uploaded_at DESC`,
    [courseId],
  );

  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    filename: row.filename,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
  }));
}

/** Widens the course term window so `Week N` dates and year inference stay sane. */
export async function refreshCourseBounds(courseId: string): Promise<void> {
  const rows = await query<{ first: string | null; last: string | null }>(
      `SELECT MIN(due_date) AS first, MAX(due_date) AS last FROM events WHERE course_id = ?`,
    [courseId],
  );
  const row = rows[0];
  if (!row?.first || !row?.last) return;

  await run(
      `UPDATE courses
       SET start_date = COALESCE(start_date, ?),
           end_date   = COALESCE(end_date, ?)
       WHERE id = ?`,
    [row.first, row.last, courseId],
  );
}

/* ------------------------------ pending uploads ------------------------------ */

/**
 * Uploads are parsed before the user confirms them, so the extracted text is
 * parked here until the review step is accepted (or the entry expires).
 */
export async function savePendingUpload(input: {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  text: string;
}): Promise<void> {
  await run(
      `INSERT INTO pending_uploads (id, filename, file_type, size_bytes, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.filename,
      input.fileType,
      input.sizeBytes,
      input.text,
      new Date().toISOString(),
    ],
  );
}

export async function takePendingUpload(id: string): Promise<{
  filename: string;
  fileType: string;
  sizeBytes: number;
  text: string;
} | null> {
  const rows = await query<{
    filename: string;
    file_type: string;
    size_bytes: number;
    text: string;
  }>(
      `SELECT filename, file_type, size_bytes, text FROM pending_uploads WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  await run(`DELETE FROM pending_uploads WHERE id = ?`, [id]);
  return {
    filename: row.filename,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
    text: row.text,
  };
}

export async function prunePendingUploads(olderThanHours = 24): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  await run(`DELETE FROM pending_uploads WHERE created_at < ?`, [cutoff]);
}

