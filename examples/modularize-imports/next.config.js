/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    modularizeImports: {
      '../components/halves': {
        transform: '../components/halves/{{ member }}',
      },
    },
  },
}
