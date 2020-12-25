import { NextApiHandler } from 'next'
import Filter from 'bad-words'
import { query } from '../../lib/db'

const filter = new Filter()

const handler: NextApiHandler = async (req, res) => {
  const { id, title, content } = req.body
  try {
    if (!id || !title || !content) {
      return res
        .status(400)
        .json({ message: '`id`,`title`, and `content` are all required' })
    }

    const results = await query(
      `
      UPDATE entries
      SET title = $1, content = $2
      WHERE id = $3
      `,
      [filter.clean(title), filter.clean(content), id]
    )

    return res.json(results)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

export default handler
