import { NextResponse } from "next/server";

import { deleteEvent, getEvent, updateEvent } from "@/lib/repo";
import { eventPatchSchema, firstIssue } from "@/lib/validate";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getEvent(id))) {
    return NextResponse.json({ error: "Deadline not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = eventPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const event = await updateEvent(id, parsed.data);
  return NextResponse.json({ event });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await deleteEvent(id))) {
    return NextResponse.json({ error: "Deadline not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
