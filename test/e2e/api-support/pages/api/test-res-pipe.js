import { Readable } from 'stream'

export default async (req, res) => {
  const dataRes = await fetch(
    `http://localhost:${req.query.port}/api/query?hello=from-pipe`
  )

  res.status(dataRes.status)
  Readable.fromWeb(dataRes.body).pipe(res)
}
