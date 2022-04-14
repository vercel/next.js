import type { NextApiRequest, NextApiResponse } from 'next'
import { client, e } from '../../../client'

// POST /api/post
// body {title: string; content: string; authorName: string}
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { title, content, authorName } = req.body

  const newPost = await e.insert(e.Post, {
    title,
    content,
    authorName: authorName,
  })

  const result = e
    .select(newPost, () => ({
      title: true,
      content: true,
      authorName: true,
    }))
    .run(client)
  res.json(result)
}
