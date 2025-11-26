export async function POST(req: Request) {
  const editorState = await req.json();
  console.log("TODO: Save editorState on the server", editorState);

  return Response.json({
    status: "ok",
  });
}
