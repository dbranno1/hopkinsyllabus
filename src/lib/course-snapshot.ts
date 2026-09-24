import zlib from "node:zlib";

import type { Course, CourseEvent, EventType } from "./types";

export const COURSE_SNAPSHOT_COOKIE = "hopsyllabus-course-snapshot";

export type CourseSnapshot = {
  course: Course;
  events: CourseEvent[];
};

type CompactEvent = [
  id: string,
  type: string,
  dueDate: string,
  dueTime: string | null,
  completed: number,
  title: string,
];

type CompactCourse = {
  id: string;
  n: string;
  cd?: string | null;
  i?: string | null;
  t?: string | null;
  cl: string;
  s?: string | null;
  e?: string | null;
  cr: string;
};

type CompactPayload = {
  v: 2;
  c: CompactCourse;
  ev: CompactEvent[];
};

function toCompact(snapshot: CourseSnapshot, maxEvents: number): CompactPayload {
  const c = snapshot.course;
  const compactCourse: CompactCourse = {
    id: c.id,
    n: c.name,
    cd: c.code ?? null,
    i: c.instructor ?? null,
    t: c.term ?? null,
    cl: c.color,
    s: c.startDate ?? null,
    e: c.endDate ?? null,
    cr: c.createdAt,
  };

  const compactEvents: CompactEvent[] = snapshot.events.slice(0, maxEvents).map((e) => [
    e.id,
    e.type,
    e.dueDate,
    e.dueTime ?? null,
    e.completed ? 1 : 0,
    e.title,
  ]);

  return {
    v: 2,
    c: compactCourse,
    ev: compactEvents,
  };
}

function fromCompact(payload: CompactPayload): CourseSnapshot {
  const c = payload.c;
  const course: Course = {
    id: c.id,
    name: c.n,
    code: c.cd ?? null,
    instructor: c.i ?? null,
    term: c.t ?? null,
    color: c.cl,
    startDate: c.s ?? null,
    endDate: c.e ?? null,
    createdAt: c.cr,
  };

  const events: CourseEvent[] = payload.ev.map(([id, type, dueDate, dueTime, completed, title]) => ({
    id,
    courseId: course.id,
    title,
    type: type as EventType,
    dueDate,
    dueTime,
    notes: null,
    confidence: 1,
    source: "parsed" as const,
    completed: completed === 1,
    createdAt: course.createdAt,
  }));

  return { course, events };
}

export function encodeCourseSnapshot(snapshot: CourseSnapshot): string {
  let limit = snapshot.events.length;
  let payload = toCompact(snapshot, limit);
  let compressed = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64url");

  // Keep size strictly below 3700 bytes so cookie plus attributes stays well under 4096-byte limit
  while (compressed.length > 3700 && limit > 5) {
    limit = Math.floor(limit * 0.8);
    payload = toCompact(snapshot, limit);
    compressed = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64url");
  }

  return compressed;
}

export function decodeCourseSnapshot(value: string | undefined): CourseSnapshot | null {
  if (!value) return null;

  try {
    const buf = Buffer.from(value, "base64url");
    try {
      const decompressed = zlib.inflateRawSync(buf).toString("utf8");
      const parsed = JSON.parse(decompressed);
      if (parsed.v === 2 && parsed.c?.id && Array.isArray(parsed.ev)) {
        return fromCompact(parsed as CompactPayload);
      }
    } catch {
      // not compressed v2
    }

    const text = buf.toString("utf8");
    const snapshot = JSON.parse(text) as CourseSnapshot;
    if (snapshot.course?.id && Array.isArray(snapshot.events)) {
      return snapshot;
    }
    return null;
  } catch {
    return null;
  }
}
