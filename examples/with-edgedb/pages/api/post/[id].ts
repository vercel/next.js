import type { NextApiRequest, NextApiResponse } from "next";
import { client, e } from "../../../client";

// PATCH /api/post/:id
async function updatePost(
  postId: string,
  data: { title?: string; content?: string },
) {
  return await e
    .update(e.Post, (post) => ({
      filter: e.op(post.id, "=", e.uuid(postId)),
      set: {
        title: data.title,
        content: data.content,
      },
    }))
    .run(client);
}

// DELETE /api/post/:id
async function deletePost(postId: string) {
  return await e
    .delete(e.Post, (post) => ({
      filter: e.op(post.id, "=", e.uuid(postId)),
    }))
    .run(client);
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const postId = req.query.id as string;

  if (req.method === "DELETE") {
    res.json(await deletePost(postId));
  } else if (req.method === "PATCH") {
    res.json(await updatePost(postId, req.body));
  } else {
    throw new Error(
      `The HTTP ${req.method} method is not supported at this route.`,
    );
  }
}
