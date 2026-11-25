import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  adapterPath: require.resolve('./test-adapter.mjs'),
  serverExternalPackages: ['test-storyblok-external'],
}

export default nextConfig
