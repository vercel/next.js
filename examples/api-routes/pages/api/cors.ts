import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_METHODS = "GET, POST, OPTIONS";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ALLOWED_METHODS);
    return res.status(405).end();
  }

  res.status(200).json({ message: "Hello from another origin" });
}
