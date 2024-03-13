import * as z from "zod"

export const indexSearchSchema = z.object({
  query: z.string().optional().default(""),
  filterQuery: z.string().optional().default(""),
  view: z.string().optional().default(""),
  limit: z.coerce.number().optional().default(12),
  offset: z.coerce.number().optional().default(0),
}).default({})

export type TIndexSearch = z.infer<typeof indexSearchSchema>
