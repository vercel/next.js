import { NextApiRequest, NextApiResponse } from 'next'
import Unsplash, { toJson } from 'unsplash-js'
import slug from 'libs/slug'

export default function getCollections(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return new Promise((resolve) => {
    const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY })

    u.users
      .collections(process.env.UNSPLASH_USER, 1, 15, 'updated')
      .then(toJson)
      .then((json) => {
        json.map((c) => (c.slug = slug(c.title)))

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'max-age=180000')
        res.end(JSON.stringify(json))
        resolve()
      })
      .catch((error) => {
        res.json(error)
        res.status(405).end()
        resolve()
      })
  })
}
