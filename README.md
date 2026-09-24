# HopSyllabus

[![CI](https://github.com/David-lu-15/HopSyllabus/actions/workflows/ci.yml/badge.svg)](https://github.com/David-lu-15/HopSyllabus/actions/workflows/ci.yml)

Turn a course syllabus into a deadline calendar.

Upload the PDF, Word document or text file your instructor handed out and
HopSyllabus reads it, finds every assignment, test, quiz and project deadline,
and builds a colour-coded calendar you can review, edit and export.

## What it does

- **Reads real syllabi** — PDF (`unpdf`), DOCX (`mammoth`), TXT, Markdown, CSV and HTML.
- **Finds the deadlines** — a heuristic parser recognises dates (`Sept. 3`,
  `09/03/2026`, `2026-09-03`, `Week 4`), times (`11:59 PM`) and classifies each entry
  as an assignment, test/exam, quiz, project or reading.
- **Always asks first** — detected dates land in a review table with a confidence
  score, and nothing is saved until you confirm it.
- **Calendar + agenda** — month grid, per-day panel, "coming up" list, overdue
  tracking and a searchable list of every deadline.
- **Exports anywhere** — download a course as `.ics` with built-in reminders and
  import it into Google, Apple or Outlook calendar.
- **Local by default** — everything lives in a SQLite file next to the app. No
  account, no third-party upload.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router) | One codebase for UI and server-side parsing/API routes; easy to deploy |
| Language | TypeScript (strict) | Safer refactors across the parser, API and UI |
| Styling | Tailwind CSS v4 | Fast, consistent design system with no runtime CSS |
| Database | Vercel Postgres or `node:sqlite` | Durable production storage with a zero-setup local fallback |
| Validation | Zod | One schema for every API payload |
| Parsing | `unpdf`, `mammoth` | Battle-tested text extraction, loaded only when a file is uploaded |

## Getting started

```sh
npm install
npm run dev      # http://localhost:3000
```4+** (for the built-in `node:sqlite` module, which is available
without a flag from Node 23.4

Requires **Node 22.5+** (for the built-in `node:sqlite` module).

Then upload a syllabus — `tests/fixtures/sample-syllabus.txt` is included if you want
to try the flow without hunting for a real one.

```sh
npm run build      # production build + type check
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Deploying to Vercel

Import the repository into Vercel and add a Vercel Postgres or Neon integration.
The integration normally provides `POSTGRES_URL`; Neon integrations may instead
provide `DATABASE_URL`. Both forms are supported. The app creates the `courses`,
`events`, `syllabus_files` and `pending_uploads` tables and their indexes
automatically on first use.

Required Vercel environment variables:

- `POSTGRES_URL` — the pooled connection string from Vercel Postgres.
- `POSTGRES_URL_NON_POOLING` — optional direct connection string fallback.
- `DATABASE_URL` or `DATABASE_URL_UNPOOLED` — accepted Neon equivalents.

Set the variables for every Vercel environment that should share the database
(Preview and Production as appropriate), then redeploy. Without either variable,
the app refuses to use ephemeral SQLite on Vercel instead of appearing to lose
courses between requests. The app has no authentication, so do not use a public
deployment for private syllabus data.

## How the parser works

1. **Extract text** — `src/lib/parse/extract-text.ts` picks the right reader for the
   uploaded file type.
2. **Clean up the layout** — `src/lib/parse/events.ts` normalises whitespace, drops
   repeated page headers/footers and re-joins table cells that PDF extraction splits
   onto separate lines (a lone `Sep 12` gets merged with the description next to it).
3. **Track sections** — headings like `Tentative Schedule` or `Grading Policy` set the
   context for the lines beneath them. Policy sections are treated much more strictly
   so grade tables do not turn into fake deadlines.
4. **Find dates** — `src/lib/parse/dates.ts` scans for date and time shapes and works
   out the year for dates written without one by preferring the academic term window.
5. **Decide what is a deadline** — a line must have a date *and* a reason to be a
   deadline (an assignment/exam/quiz/project keyword or an explicit "due" phrase).
   Each candidate gets a confidence score.
6. **Review** — the client shows every candidate, and the confirmed rows are posted to
   the import endpoint, which de-duplicates against existing deadlines.

Anything the parser gets wrong can be corrected in the review table, in the deadline
list, or in the edit dialog — so a low-confidence guess is never destructive.

## Project structure

```
src/
  app/
    page.tsx                        dashboard: courses, stats, calendar
    calendar/page.tsx               full calendar across all courses
    courses/[id]/page.tsx           single course workspace
    api/
      parse/route.ts                upload + parse (stages the text for review)
      courses/route.ts              list / create courses
      courses/[id]/route.ts         read / update / delete a course
      courses/[id]/events/route.ts  list / add deadlines
      courses/[id]/import/route.ts  commit reviewed deadlines
      courses/[id]/calendar.ics/    .ics export for a course
      events/[id]/route.ts          update / delete a deadline
  components/                       calendar, dialogs, upload flow, deadline list
  lib/
    db.ts                           SQLite connection + schema
    repo.ts                         data access layer
    ics.ts                          RFC 5545 calendar generation
    parse/                          syllabus → deadlines pipeline
    format.ts                       date helpers shared by server and client
```

## Data

Locally, courses, deadlines and the text of uploaded syllabi are stored in
`.data/hopsyllabus.db` (git-ignored). Change the location with the
`HOPSYLLABUS_DATA_DIR` environment variable. When Postgres is configured, these
records are stored in the hosted database instead; deleting the local file then
has no effect on the hosted data.

## Limitations

- Scanned/image-only PDFs contain no text layer; the app says so and you can add
  deadlines manually.
- The parser is heuristic, not an LLM: unusual layouts (rotated tables, hand-written
  schedules) may need manual fixes in the review step.
- No authentication — it is designed to run locally or behind your own auth proxy.

## Contributing

Work on a branch and open a pull request — `main` is protected. See
[AGENTS.md](./AGENTS.md) for the full branching and review rules.
