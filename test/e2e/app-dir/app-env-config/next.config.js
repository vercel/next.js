process.env.NEXT_PUBLIC_NEW_NEXT_CONFIG_VALUE = 'hello set in next.config.js'

/** @type {import('next').NextConfig} */
const config = {
  // update me
  env: {
    nextConfigEnv: process.env.ENV_KEY_IN_NEXT_CONFIG,
    nextConfigPublicEnv: process.env.NEXT_PUBLIC_ENV_KEY_IN_NEXT_CONFIG,
  },
  experimental: {
    useCache: true,
  },
  async redirects() {
    return [
      {
        source: '/hello',
        permanent: false,
        destination: `/${process.env.NEXT_PUBLIC_TEST_DEST}`,
      },
    ]
  },
}

module.exports = config
