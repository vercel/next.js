/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    devtoolNewPanelUI: true,
    authInterrupts: true,
    globalNotFound: true,
  },
}

module.exports = nextConfig
