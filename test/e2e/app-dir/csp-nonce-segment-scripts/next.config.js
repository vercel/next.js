/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Nonces are added when a request is rendered. With Cache Components the
  // layouts and loading files would be prerendered into a static shell, which
  // has no nonce, so this test opts out.
  cacheComponents: false,
}

module.exports = nextConfig
