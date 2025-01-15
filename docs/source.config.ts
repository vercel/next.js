import { defineDocs, defineConfig } from 'fumadocs-mdx/config'

export const { docs, meta } = defineDocs({
  dir: 'content',
  docs: {
    async: true,
  },
})

export default defineConfig()
