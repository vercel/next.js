/**
 * @type {import('next').NextConfig}
 */
const config = {
  typescript: {
    ignoreBuildErrors: true,
  },
}

if (process.env.BASE_PATH) {
  config.basePath = process.env.BASE_PATH
}

module.exports = config
