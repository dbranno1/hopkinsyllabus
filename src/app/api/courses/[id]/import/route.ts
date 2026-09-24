import { NextResponse } from "next/server";

import { COURSE_SNAPSHOT_COOKIE, encodeCourseSnapshot } from "@/lib/course-snapshot";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/types";
import {
  createCourse,
  createEvents,
  getCourse,
  listEvents,
  refreshCourseBounds,
  saveSyllabusFile,
  takePendingUpload,
  updateCourse,
} from "@/lib/repo";
import { firstIssue, importSchema } from "@/lib/validate";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Commits the reviewed deadlines from an upload onto a course. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { uploadId, events, course: coursePatch } = parsed.data;
  if (!(await getCourse(id))) {
    await createCourse({
      id,
      name: coursePatch?.name?.trim() || "New course",
      code: coursePatch?.code,
      instructor: coursePatch?.instructor,
      term: coursePatch?.term,
      color: coursePatch?.color,
      startDate: coursePatch?.startDate,
      endDate: coursePatch?.endDate,
    });
  }

  const existing = await listEvents(id);
  const seen = new Set(
    existing.map(
      (event) =>
        `${event.dueDate}|${event.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`,
    ),
  );

  const pending = uploadId ? await takePendingUpload(uploadId) : null;

  const fresh = events.filter((event) => {
    const key = `${event.dueDate}|${event.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const created = await createEvents(
    fresh.map((event) => ({
      courseId: id,
      title: event.title,
      type: event.type as EventType,
      dueDate: event.dueDate,
      dueTime: event.dueTime ?? null,
      notes: event.notes ?? (pending ? `${EVENT_TYPE_LABELS[event.type as EventType]} · ${pending.filename}` : null),
      confidence: event.confidence ?? 0.8,
      source: "parsed" as const,
    })),
  );

  if (pending) {
    await saveSyllabusFile({
      courseId: id,
      filename: pending.filename,
      fileType: pending.fileType,
      sizeBytes: pending.sizeBytes,
      text: pending.text,
    });
  }

  if (coursePatch && Object.keys(coursePatch).length > 0) {
    await updateCourse(id, coursePatch);
  }

  await refreshCourseBounds(id);

  const response = NextResponse.json({
    created: created.length,
    skipped: events.length - fresh.length,
    course: await getCourse(id),
  });
  const currentCourse = await getCourse(id);
  const currentEvents = await listEvents(id);
  if (currentCourse) {
    response.cookies.set(
      COURSE_SNAPSHOT_COOKIE,
      encodeCourseSnapshot({ course: currentCourse, events: currentEvents }),
      {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }
  return response;
}
