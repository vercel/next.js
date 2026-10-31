/** @type {import('next').NextConfig} */
// Intentionally default config: the reproduction in
// https://github.com/vercel/next.js/issues/97135 requires no rewrites, no
// cacheComponents, and no special flags. Optimistic routing (Known Routes
// discovery) is enabled by default.
module.exports = {}
