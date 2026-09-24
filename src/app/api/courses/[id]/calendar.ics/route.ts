import { NextResponse } from "next/server";

import { buildCalendar } from "@/lib/ics";
import { getCourse, listEvents } from "@/lib/repo";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Downloads the course deadlines as an `.ics` feed for any calendar app. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const calendar = buildCalendar(course, await listEvents(id));
  const slug = (course.code ?? course.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug || "course"}-hopsyllabus.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
