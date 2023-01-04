// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  modularizeImports: {
    '../components/halves': {
      transform: '../components/halves/{{ member }}',
    },
  },
}

module.exports = nextConfig
