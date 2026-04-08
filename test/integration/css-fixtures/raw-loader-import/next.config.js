/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // This is the problematic configuration mentioned in the GitHub issue
    // It should work with our fix
    config.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    })
    return config
  },
}

module.exports = nextConfig
