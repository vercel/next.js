/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactMaxHeadersLength: process.env.TEST_REACT_MAX_HEADERS_LENGTH
    ? parseInt(process.env.TEST_REACT_MAX_HEADERS_LENGTH)
    : undefined,
  experimental: {
    // Emitting Link headers currently requires the experimental PPR feature.
    ppr: true,
  },
}

module.exports = nextConfig
