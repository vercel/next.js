import { NextApiRequest, NextApiResponse } from "next";

export default async function handleEditorStateChange(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res
      .setHeader("Allow", ["POST"])
      .status(405)
      .end(`Method ${req.method} Not Allowed`);
  }

  const editorState = JSON.parse(req.body);
  console.log("TODO: Save editorState on the server", editorState);

  res.json({
    status: "ok",
  });
}
