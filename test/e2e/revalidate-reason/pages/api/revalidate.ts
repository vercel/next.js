import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ revalidated: boolean }>
) {
  try {
    await res.revalidate('/')
    return res.json({ revalidated: true })
  } catch (err) {
    console.error('Failed to revalidate:', err)
  }

  res.json({ revalidated: false })
}
