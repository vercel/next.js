import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const message = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  author: v.string(),
  body: v.string(),
});

export const list = query({
  args: {},
  returns: v.array(message),
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").order("desc").take(50);

    return messages.reverse();
  },
});

export const send = mutation({
  args: { body: v.string(), author: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const { body, author } = args;
    return await ctx.db.insert("messages", { body, author });
  },
});
