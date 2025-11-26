/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactMaxHeadersLength: process.env.TEST_REACT_MAX_HEADERS_LENGTH
    ? parseInt(process.env.TEST_REACT_MAX_HEADERS_LENGTH)
    : undefined,
  // Emitting Link headers currently requires the experimental PPR feature.
  cacheComponents: true,
}

module.exports = nextConfig
