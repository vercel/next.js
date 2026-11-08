import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Every `path` of the query is revalidated at the same time.
  const paths = [req.query.path ?? []].flat()

  try {
    await Promise.all(
      paths.map((path) =>
        res.revalidate(path, { unstable_onlyGenerated: true })
      )
    )
    res.json({ revalidated: true })
  } catch (err) {
    res.status(500).json({ revalidated: false, error: String(err) })
  }
}
