/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      // Only files imported with `?raw` are loaded as strings. Turbopack has no
      // built-in `?raw` handling, the query is matched by this rule.
      '*.txt': { condition: { query: '?raw' }, type: 'text' },
      // `raw` is an opaque module without exports.
      '*.md': { type: 'raw' },
    },
  },
}

module.exports = nextConfig
