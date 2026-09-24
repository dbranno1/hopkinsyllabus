import { NextResponse } from "next/server";

import { createCourse, listCourseSummaries } from "@/lib/repo";
import { courseCreateSchema, firstIssue } from "@/lib/validate";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ courses: await listCourseSummaries() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = courseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const course = await createCourse(parsed.data);
  return NextResponse.json({ course }, { status: 201 });
}
