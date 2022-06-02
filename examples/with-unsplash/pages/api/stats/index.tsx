import { NextApiRequest, NextApiResponse } from 'next'
import Unsplash, { toJson } from 'unsplash-js'

export default function getStats(req: NextApiRequest, res: NextApiResponse) {
  return new Promise((resolve) => {
    const u = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY })

    u.users
      .statistics(process.env.UNSPLASH_USER, 'days', 30)
      .then(toJson)
      .then((json) => {
        res.setHeader('Cache-Control', 'max-age=180000')
        res.status(200).json(json)
        resolve()
      })
      .catch((error) => {
        res.status(405).json(error)
        resolve()
      })
  })
}
