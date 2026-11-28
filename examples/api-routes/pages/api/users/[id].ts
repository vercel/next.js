import type { NextApiRequest, NextApiResponse } from "next";
import { findUser, type User } from "@/lib/users";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<User | { error: string }>,
) {
  const user = findUser(String(req.query.id));
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  switch (req.method) {
    case "GET":
      return res.status(200).json(user);
    case "PUT": {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      if (!name) {
        return res
          .status(400)
          .json({ error: "Expected a JSON body with a name" });
      }
      // The data is in memory, so return the updated user without storing it.
      return res.status(200).json({ ...user, name });
    }
    default:
      res.setHeader("Allow", "GET, PUT");
      return res.status(405).end();
  }
}
