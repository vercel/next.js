import { NextApiRequest, NextApiResponse } from "next";
import Unsplash, { toJson } from "unsplash-js";
import slug from "libs/slug";

export default function getCollections(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return new Promise((resolve) => {
    const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY });

    u.users
      .collections(process.env.UNSPLASH_USER, 1, 15, "updated")
      .then(toJson)
      .then((json) => {
        json.map((c) => (c.slug = slug(c.title)));

        res.setHeader("Cache-Control", "max-age=180000");
        res.status(200).json(json);
        resolve();
      })
      .catch((error) => {
        res.status(405).json(error);
        resolve();
      });
  });
}
