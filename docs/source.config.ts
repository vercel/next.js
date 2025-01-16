import { defineDocs, defineConfig } from 'fumadocs-mdx/config'
import { z } from 'zod'

export const { docs, meta } = defineDocs({
  dir: 'content',
  docs: {
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      full: z.boolean().optional(),
      _openapi: z.any(),
      source: z.string().optional(),
    }),
    async: true,
  },
})

export default defineConfig()
