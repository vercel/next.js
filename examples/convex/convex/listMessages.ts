import { query } from './_generated/server'
import { Document } from './_generated/dataModel'

export default query(async ({ db }): Promise<Document<'messages'>[]> => {
  return await db.query('messages').collect()
})
