// The deploy harness adds this alias to the root config, but this app loads
// its own config under apps/web.
// TODO: Remove this alias once the deploy harness also patches nested configs.
// It currently only patches the fixture-root config:
// https://github.com/vercel/next.js/blob/3854a98484ec2ce5bafcb074ef0fbad5290dede2/test/lib/next-modes/base.ts#L520-L554
if (process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS) {
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS =
    process.env.NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
