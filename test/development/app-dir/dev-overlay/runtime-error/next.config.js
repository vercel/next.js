/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // TODO: remove this once the feature is stable
    // noop: using __NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY keyword for easy search
    newDevOverlay: true,
  },
}

module.exports = nextConfig
