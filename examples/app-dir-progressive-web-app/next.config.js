const withPWA = require('@imbios/next-pwa')({
  dest: 'public',
})

/** @type {import('next').NextConfig} */
module.exports = withPWA({
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
})
