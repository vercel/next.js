// The deploy harness adds these aliases to the root config, but this app loads
// its own config under apps/web.
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS) {
  process.env.__NEXT_CACHE_COMPONENTS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS
}
// TODO: Remove these aliases once the deploy harness also patches nested configs.
// It currently only patches the fixture-root config:
// https://github.com/vercel/next.js/blob/3854a98484ec2ce5bafcb074ef0fbad5290dede2/test/lib/next-modes/base.ts#L520-L554
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS) {
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS
}

/**
 * @type {import('next').NextConfig}
 */
module.exports = {}
