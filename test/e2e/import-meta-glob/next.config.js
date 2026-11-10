/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      // The synthetic module of an `import.meta.glob()` call is internal, so a rule
      // that would match its path doesn't apply to it.
      '*.import-meta-glob.mjs': {
        type: 'asset',
      },
    },
  },
}
