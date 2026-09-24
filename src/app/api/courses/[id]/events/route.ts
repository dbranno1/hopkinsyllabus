import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createEvents,
  getCourse,
  listEvents,
  refreshCourseBounds,
} from "@/lib/repo";
import { eventSchema, firstIssue } from "@/lib/validate";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const payloadSchema = z.object({
  events: z.array(eventSchema).min(1).max(500),
});

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getCourse(id))) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ events: await listEvents(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getCourse(id))) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const events = await createEvents(
    parsed.data.events.map((event) => ({
      ...event,
      courseId: id,
      source: "manual" as const,
      confidence: 1,
    })),
  );
  await refreshCourseBounds(id);

  return NextResponse.json({ events }, { status: 201 });
}
