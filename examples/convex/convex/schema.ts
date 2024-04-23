import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    messages: defineTable({
      author: v.string(),
      body: v.string(),
    }),
  },
  {
    // When you want runtime validation of the schema, set this to true.
    schemaValidation: false,
    // This option allows you to read and write tables not specified here.
    // strictTableNameTypes: false,
  },
);
