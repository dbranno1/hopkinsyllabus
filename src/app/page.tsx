import Link from "next/link";

import { CalendarBoard } from "@/components/CalendarBoard";
import { DeadlineList } from "@/components/DeadlineList";
import { DeleteCourseButton } from "@/components/DeleteCourseButton";
import { TypeDot } from "@/components/TypeChip";
import { UploadSyllabus } from "@/components/UploadSyllabus";
import { countdownLabel, daysUntil, prettyDate, todayIso } from "@/lib/format";
import { listCourseSummaries, listEvents } from "@/lib/repo";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Upload",
    body: "Drop in the syllabus your instructor handed out — PDF, Word, text or Markdown.",
  },
  {
    title: "Review",
    body: "Every detected deadline shows up in a table with a confidence score so you can fix the odd date.",
  },
  {
    title: "Keep track",
    body: "Deadlines land on a colour-coded calendar and export to Google, Apple or Outlook calendar.",
  },
];

function StatCard({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const courses = await listCourseSummaries();
  const events = await listEvents();
  const today = todayIso();

  if (courses.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <UploadSyllabus variant="hero" courses={[]} />

        <div className="card p-6">
            <h2 className="font-serif text-xl font-semibold text-brand">How it works</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#f1c400]/25 text-sm font-semibold text-brand">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-xl border border-line bg-surface-2/40 p-3 text-xs text-muted">
            Everything is stored locally in a SQLite file next to the app — no account and
            no upload of your syllabus to a third party.
          </p>
        </div>
      </div>
    );
  }

  const open = events.filter((event) => !event.completed);
  const dueSoon = open.filter((event) => {
    const days = daysUntil(event.dueDate, today);
    return days >= 0 && days <= 7;
  });
  const overdue = open.filter((event) => event.dueDate < today);
  const thisMonth = open.filter((event) => event.dueDate.slice(0, 7) === today.slice(0, 7));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Courses" value={String(courses.length)} />
        <StatCard
          label="Due in the next 7 days"
          value={String(dueSoon.length)}
          tone="text-amber-300"
        />
        <StatCard label="Due this month" value={String(thisMonth.length)} />
        <StatCard
          label="Overdue"
          value={String(overdue.length)}
          tone={overdue.length > 0 ? "text-rose-300" : "text-ink"}
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Your courses</h2>
          <span className="text-xs text-muted">{events.length} deadlines tracked</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="card group p-4 transition-colors hover:border-brand/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {[course.code, course.term].filter(Boolean).join(" · ") || "Course"}
                  </p>
                  <h3 className="mt-0.5 truncate text-base font-semibold group-hover:text-brand-soft">
                    {course.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: course.color }}
                    aria-hidden="true"
                  />
                  <DeleteCourseButton courseId={course.id} courseName={course.name} />
                </div>
              </div>

              <p className="mt-2.5 text-xs text-muted">
                {course.eventCount} deadline{course.eventCount === 1 ? "" : "s"}
                {course.instructor ? ` · ${course.instructor}` : ""}
              </p>

              {course.nextEvent ? (
                <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-2.5">
                  <p className="text-[0.68rem] tracking-wide text-muted uppercase">
                    Next up · {countdownLabel(course.nextEvent.dueDate, today)}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <TypeDot type={course.nextEvent.type} />
                    <span className="truncate">{course.nextEvent.title}</span>
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-muted">
                    {prettyDate(course.nextEvent.dueDate)}
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-line p-2.5 text-xs text-muted">
                  No deadlines yet — upload the syllabus to fill this in.
                </p>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Add another syllabus</h2>
        <UploadSyllabus courses={courses} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Calendar</h2>
        <CalendarBoard courses={courses} events={events} today={today} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Every deadline</h2>
        <DeadlineList courses={courses} events={events} today={today} />
      </section>
    </div>
  );
}
