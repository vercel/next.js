/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Note: Partial Prefetching is NOT enabled globally. The target route opts
  // in per-segment via `prefetch = 'partial'` on a deeply nested page.
  cacheComponents: true,
}

module.exports = nextConfig
