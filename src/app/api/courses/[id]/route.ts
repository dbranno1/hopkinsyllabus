import { NextResponse } from "next/server";

import {
  deleteCourse,
  getCourse,
  listEvents,
  listSyllabusFiles,
  updateCourse,
} from "@/lib/repo";
import { coursePatchSchema, firstIssue } from "@/lib/validate";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({
    course,
    events: await listEvents(id),
    syllabi: await listSyllabusFiles(id),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = coursePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const course = await updateCourse(id, parsed.data);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ course });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await deleteCourse(id))) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
