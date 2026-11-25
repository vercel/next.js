import type { NextApiRequest, NextApiResponse } from "next";
import { users, type User } from "@/lib/users";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<User[]>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  res.status(200).json(users);
}
