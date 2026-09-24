import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { CalendarBoard } from "@/components/CalendarBoard";
import { CourseSettings } from "@/components/CourseSettings";
import { DeadlineList } from "@/components/DeadlineList";
import { UploadSyllabus } from "@/components/UploadSyllabus";
import { countdownLabel, prettyDate, todayIso } from "@/lib/format";
import { COURSE_SNAPSHOT_COOKIE, decodeCourseSnapshot } from "@/lib/course-snapshot";
import { getCourse, listEvents, listSyllabusFiles } from "@/lib/repo";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function CoursePage({ params }: PageProps) {
  const { id } = await params;
  const storedCourse = await getCourse(id);
  const snapshot = storedCourse ? null : decodeCourseSnapshot((await cookies()).get(COURSE_SNAPSHOT_COOKIE)?.value);
  const course = storedCourse ?? (snapshot?.course.id === id ? snapshot.course : null);
  if (!course) notFound();

  const events = storedCourse ? await listEvents(course.id) : snapshot?.events ?? [];
  const syllabi = await listSyllabusFiles(course.id);
  const today = todayIso();

  const open = events.filter((event) => !event.completed);
  const next = open.find((event) => event.dueDate >= today) ?? null;
  const overdue = open.filter((event) => event.dueDate < today).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1.5 size-4 shrink-0 rounded-full"
            style={{ backgroundColor: course.color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {[course.code, course.term].filter(Boolean).join(" · ") || "Course"}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{course.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {course.instructor ? <span>{course.instructor}</span> : null}
              <span>
                {events.length} deadline{events.length === 1 ? "" : "s"}
              </span>
              {next ? (
                <span className="text-amber-300">
                  Next: {next.title} · {prettyDate(next.dueDate)} (
                  {countdownLabel(next.dueDate, today)})
                </span>
              ) : null}
              {overdue > 0 ? (
                <span className="text-rose-300">{overdue} overdue</span>
              ) : null}
            </p>
          </div>
        </div>

        <Link href="/" className="btn-ghost">
          ← All courses
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {syllabi.length > 0 ? "Add deadlines from another syllabus" : "Upload the syllabus"}
        </h2>
        <UploadSyllabus
          courses={[{ id: course.id, name: course.name, code: course.code, startDate: course.startDate }]}
          courseId={course.id}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Calendar</h2>
        <CalendarBoard
          courses={[{ id: course.id, name: course.name, code: course.code, color: course.color }]}
          events={events}
          today={today}
          showCourseFilter={false}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Deadlines</h2>
          <DeadlineList
            courses={[{ id: course.id, name: course.name, code: course.code }]}
            events={events}
            today={today}
            emptyHint="No deadlines yet — upload the syllabus or add one manually."
          />
        </section>

        <div className="space-y-5">
          <CourseSettings
            course={course}
            syllabi={syllabi.map((file) => ({
              id: file.id,
              filename: file.filename,
              uploadedAt: file.uploadedAt,
              sizeBytes: file.sizeBytes,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
