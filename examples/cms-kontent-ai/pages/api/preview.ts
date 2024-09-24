import { NextApiRequest, NextApiResponse } from "next";
import { getPostBySlug } from "../../lib/api";

export default async function preview(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Check the secret and next parameters
  // This secret should only be known to this API route and the CMS
  if (
    req.query.secret !== process.env.KONTENT_PREVIEW_SECRET ||
    !req.query.slug
  ) {
    return res
      .status(401)
      .json({ message: "Invalid token or slug not specified" });
  }

  // Fetch the headless CMS to check if the provided `slug` exists
  const post = await getPostBySlug(req.query.slug as string, true);

  // If the slug doesn't exist prevent preview mode from being enabled
  if (!post) {
    return res.status(401).json({ message: "Invalid slug" });
  }

  // Enable Preview Mode by setting the cookie
  res.setDraftMode({ enable: true });

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.writeHead(307, { Location: `/posts/${post.slug}` });
  res.end();
}
