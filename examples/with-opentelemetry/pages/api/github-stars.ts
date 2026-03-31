import { NextApiRequest, NextApiResponse } from "next";
import { fetchGithubStars } from "../../shared/fetch-github-stars";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const stars = await fetchGithubStars();
  res.status(200).json({ stars });
}
