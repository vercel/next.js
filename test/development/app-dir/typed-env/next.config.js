/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  env: {
    FROM_NEXT_CONFIG: 'FROM_NEXT_CONFIG',
  },
  experimental: {
    typedEnv: true,
  },
}

module.exports = nextConfig
