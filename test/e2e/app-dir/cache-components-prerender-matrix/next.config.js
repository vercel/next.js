/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The partial matrix's steady-state expectations (on-demand shell
  // specialization, entry sharing across never-prerenderable params)
  // describe the partialFallback serving contract, which the adapter only
  // emits for apps with Partial Prefetching enabled (vercel/next.js#96074).
  partialPrefetching: true,
}

module.exports = nextConfig
