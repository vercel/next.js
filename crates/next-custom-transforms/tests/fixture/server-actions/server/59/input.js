'use server'

import { db } from './database'

export const createItem = async (title) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `INSERT INTO items (title) VALUES ($title)`,
        { $title: title },
        function () {
          // arguments is allowed here
          const [err] = arguments

          if (err) {
            reject(err)
          }

          // this is allowed here
          resolve(this.lastID)
        }
      )
    })
  })
}
