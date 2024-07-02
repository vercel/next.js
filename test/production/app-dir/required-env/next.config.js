/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  requiredEnv: ['REQUIRED_ENV_1', 'REQUIRED_ENV_2', 'MISSING_ENV'],
  env: { REQUIRED_ENV_1: 'REQUIRED_ENV_1' },
}

module.exports = nextConfig
