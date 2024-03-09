import { NextApiRequest, NextApiResponse } from "next";
import Unsplash, { toJson } from "unsplash-js";

export default function getPhotos(req: NextApiRequest, res: NextApiResponse) {
  return new Promise((resolve) => {
    const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY });

    u.users
      .photos(process.env.UNSPLASH_USER, 1, 50, "latest")
      .then(toJson)
      .then((json: string) => {
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
