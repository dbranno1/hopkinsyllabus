import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  EmptyDocumentError,
  MAX_UPLOAD_BYTES,
  SUPPORTED_FORMATS,
  UnsupportedFileError,
  parseSyllabus,
  type ParsedDocument,
} from "@/lib/parse";
import { prunePendingUploads, savePendingUpload } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an uploaded syllabus and parks the extracted text until the user
 * confirms the detected deadlines, so nothing is written behind their back.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload the syllabus as multipart/form-data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: `Attach a syllabus file (${SUPPORTED_FORMATS}).` },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Files must be smaller than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const anchorRaw = form.get("anchorStart");
  const anchorStart =
    typeof anchorRaw === "string" && ISO_DATE.test(anchorRaw) ? anchorRaw : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await parseSyllabus({
      buffer,
      fileName: file.name,
      mimeType: file.type,
      anchorStart,
    });

    await prunePendingUploads();
    const uploadId = randomUUID();
    await savePendingUpload({
      id: uploadId,
      filename: file.name,
      fileType: document.fileType,
      sizeBytes: buffer.byteLength,
      text: document.text,
    });

    const payload = { ...document } as Partial<ParsedDocument>;
    delete payload.text;

    return NextResponse.json({ uploadId, ...payload });
  } catch (error) {
    if (error instanceof UnsupportedFileError || error instanceof EmptyDocumentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to parse syllabus", error);
    return NextResponse.json(
      { error: "That file could not be read. Try exporting it again as PDF or DOCX." },
      { status: 500 },
    );
  }
}
