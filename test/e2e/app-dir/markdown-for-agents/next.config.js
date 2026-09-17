/** @type {import('next').NextConfig} */
const nextConfig = {
  markdown: {
    enabled: true,
    mode: 'prefer-authored',
    actions: true,
    suffix: true,
  },
}

module.exports = nextConfig
