/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
}

module.exports = nextConfig
