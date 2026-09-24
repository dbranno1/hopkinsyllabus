import Link from "next/link";

import { CalendarBoard } from "@/components/CalendarBoard";
import { DeadlineList } from "@/components/DeadlineList";
import { todayIso } from "@/lib/format";
import { listCourseSummaries, listEvents } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const courses = await listCourseSummaries();
  const events = await listEvents();
  const today = todayIso();

  if (courses.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Nothing on the calendar yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Upload a syllabus and HopSyllabus will fill this calendar with assignments, tests,
          quizzes and project deadlines.
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          Upload a syllabus
        </Link>
      </div>
    );
  }

  const upcoming = events.filter((event) => !event.completed && event.dueDate >= today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted">
            {upcoming.length} upcoming deadline{upcoming.length === 1 ? "" : "s"} across{" "}
            {courses.length} course{courses.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          Add a syllabus
        </Link>
      </div>

      <CalendarBoard courses={courses} events={events} today={today} />

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Every deadline</h2>
        <DeadlineList courses={courses} events={events} today={today} />
      </section>
    </div>
  );
}
