/** @type {import('next').NextConfig} */
const nextConfig = {
  markdownAgents: {
    enabled: true,
    mode: 'prefer-authored',
    actions: true,
    suffix: true,
  },
}

module.exports = nextConfig
