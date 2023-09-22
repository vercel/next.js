import { query, mutation } from './_generated/server'
import { Doc } from './_generated/dataModel'

export const list = query(async ({ db }): Promise<Doc<'messages'>[]> => {
  return await db.query('messages').collect()
})

export const send = mutation(
  async ({ db }, { body, author }: { body: string; author: string }) => {
    const message = { body, author }
    await db.insert('messages', message)
  }
)
