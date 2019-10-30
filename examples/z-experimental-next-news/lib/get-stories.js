import db from './db'
import { transform } from './get-item'

export default async (type = 'topstories', { page = 1, max = 30 } = {}) => {
  const start = max * (page - 1)
  const end = start + max - 1
  const ids = await db.child(type).once('value')
  const stories = await Promise.all(
    ids
      .val()
      .slice(start, end)
      .map(id =>
        db
          .child('item')
          .child(id)
          .once('value')
      )
  )
  return stories.map(obj => transform(obj.val()))
}
