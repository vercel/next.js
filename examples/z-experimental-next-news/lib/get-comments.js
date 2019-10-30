import db from './db'

// hydrate comments based on an array of item ids
export default function fetch (ids) {
  return Promise.all(
    ids.map(async id => {
      const item = await db
        .child('item')
        .child(id)
        .once('value')
      const val = item.val()
      return {
        id: val.id,
        user: val.by,
        text: val.text,
        date: new Date(val.time * 1000),
        comments: await fetch(val.kids || []),
        commentsCount: val.descendants
      }
    })
  )
}
