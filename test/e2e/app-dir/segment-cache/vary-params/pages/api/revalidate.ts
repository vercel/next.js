import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ revalidated: boolean }>
) {
  const pathParam = req.query['path']

  if (!pathParam) {
    return res.status(400).json({ revalidated: false })
  }

  const paths = Array.isArray(pathParam) ? pathParam : [pathParam]

  try {
    await Promise.all(paths.map((path) => res.revalidate(path)))
    return res.status(200).json({ revalidated: true })
  } catch (error) {
    console.error('Failed to revalidate paths:', paths, error)
    return res.status(500).json({ revalidated: false })
  }
}
