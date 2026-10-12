// Faithful repro of the real-world trigger: `next typegen` runs with
// NODE_ENV=production (see packages/next/src/bin/next.ts), which flips a
// `warnOrError` helper to throw when a required env var is missing — exactly the
// pattern apps like vercel-site use (e.g. CONTENTFUL_DELIVERY_TOKEN).
//
// In dev (e.g. during test harness setup) it only warns, so setup is unaffected;
// during `next typegen` it throws, taking config loading — and therefore route
// type generation — down with it.
const isDev = process.env.NODE_ENV !== 'production'
const warnOrError = isDev
  ? console.warn
  : (msg) => {
      throw new Error(msg)
    }

if (!process.env.SOME_REQUIRED_TOKEN) {
  warnOrError('SOME_REQUIRED_TOKEN is missing from env')
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {}

module.exports = nextConfig
