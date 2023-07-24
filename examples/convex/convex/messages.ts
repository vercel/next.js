import { query, mutation } from './_generated/server'
import { Doc } from './_generated/dataModel'
import { v } from 'convex/values'

export const list = query({
  handler: async (ctx): Promise<Doc<'messages'>[]> => {
    return await ctx.db.query('messages').collect()
  },
})

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author }
    await ctx.db.insert('messages', message)
  },
})
