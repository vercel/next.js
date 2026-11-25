import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const visits = Number(req.cookies.visits ?? 0) + 1;

  res.setHeader(
    "Set-Cookie",
    `visits=${visits}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
  );
  res.status(200).json({ visits });
}
