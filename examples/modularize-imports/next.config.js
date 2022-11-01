// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  experimental: {
    modularizeImports: {
      '../components/halves': {
        transform: '../components/halves/{{ member }}',
      },
    },
  },
}

module.exports = nextConfig
