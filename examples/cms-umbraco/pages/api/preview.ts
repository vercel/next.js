import type { NextApiRequest, NextApiResponse } from "next";

export default async function preview(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { secret } = req.query;

  // Check the secret and next parameters
  // This secret should only be known by this API route
  if (!secret) {
    return res.status(401).json({ message: "No token provided" });
  }

  if (secret !== process.env.UMBRACO_PREVIEW_SECRET) {
    return res.status(401).json({ message: "Invalid token" });
  }

  res.setDraftMode({ enable: true });

  res.redirect("/");
  res.end();
  return res;
}
