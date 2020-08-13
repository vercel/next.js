import { NextApiRequest, NextApiResponse } from 'next'
import Unsplash, { toJson } from "unsplash-js"
import request from "request";
import fetch from 'node-fetch'
global.fetch = fetch

export default (req: NextApiRequest, res: NextApiResponse) => {
  const {
    query: { id },
  } = req

  const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY })

  return u.photos.getPhoto(id.toString())
    .then(toJson)
    .then(json => {
      u.photos.downloadPhoto(json)

      const filePath = json.links.download;
      const fileName = id + ".jpg";

      res.setHeader("content-disposition", "attachment; filename=" + fileName);

      request
        .get(filePath)
        .on("error", function (err) {
          res.writeHead(404, { "Content-Type": "text/html" })
          res.write(err)
          res.end()
          return
        })
        .pipe(res)
    })
    .catch(error => {
      res.json(error)
      res.status(405).end()
    })
};