import { query } from './_generated/server'
import { Doc } from './_generated/dataModel'

export default query(async ({ db }): Promise<Doc<'messages'>[]> => {
  return await db.query('messages').collect()
})
