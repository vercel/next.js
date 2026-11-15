import { getRun } from "workflow/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = getRun(runId);

  if (!(await run.exists)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  // Streams every progress event the workflow has written, from the start,
  // and keeps the connection open until the workflow closes the stream
  return new Response(run.getReadable(), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
