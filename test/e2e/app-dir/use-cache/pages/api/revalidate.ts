import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const pathParam = req.query['path']

  if (!pathParam) {
    return res.status(400).send(`Missing required query param "path"`)
  }

  const paths = Array.isArray(pathParam) ? pathParam : [pathParam]

  try {
    await Promise.all(paths.map((path) => res.revalidate(path)))
    return res.json({ revalidated: true })
  } catch (err) {
    console.error(err)
    return res.status(500).send(`Error revalidating ${paths}`)
  }
}
