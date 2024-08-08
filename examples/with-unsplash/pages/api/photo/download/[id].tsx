import { NextApiRequest, NextApiResponse } from "next";
import Unsplash, { toJson } from "unsplash-js";
import fetch from "node-fetch";
global.fetch = fetch;

export default function download(req: NextApiRequest, res: NextApiResponse) {
  const {
    query: { id },
  } = req;

  const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY });

  return new Promise((resolve) => {
    u.photos
      .getPhoto(id.toString())
      .then(toJson)
      .then((json) => {
        u.photos.downloadPhoto(json);

        const filePath = json.links.download;
        const fileName = id + ".jpg";

        res.setHeader(
          "content-disposition",
          "attachment; filename=" + fileName,
        );

        fetch(filePath)
          .then((r) => r.buffer())
          .then((buff) => {
            res.end(buff);
            resolve();
          })
          .catch((error) => {
            res.json(error);
            res.status(405).end();
            resolve();
          });
      })
      .catch((error) => {
        res.json(error);
        res.status(405).end();
        resolve();
      });
  });
}
