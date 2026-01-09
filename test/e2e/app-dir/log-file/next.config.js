/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Disable browser log forwarding to terminal to avoid duplicate logs in the file
    browserDebugInfoInTerminal: false,
  },
}

module.exports = nextConfig
