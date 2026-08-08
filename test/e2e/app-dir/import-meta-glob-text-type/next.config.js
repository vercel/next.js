/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      // Turbopack has no built-in `?raw` handling, the query is matched by a
      // rule. `raw` and `text` are aliases, both load the file as a string.
      '*.txt': { condition: { query: '?raw' }, type: 'text' },
      '*.rst': { condition: { query: '?raw' }, type: 'raw' },
      '*.md': { type: 'raw' },
      '*.mdx': { type: 'text' },
    },
  },
}

module.exports = nextConfig
