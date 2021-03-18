const withPWA = require('next-pwa')
const runtimeCaching = require('next-pwa/cache')

module.exports = withPWA({
  eslint: {
    build: false,
  },
  pwa: {
    dest: 'public',
    runtimeCaching,
  },
})
