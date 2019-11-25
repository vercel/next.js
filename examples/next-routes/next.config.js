const { routes } = require('./routes')

module.exports = {
  experimental: {
    rewrites() {
      const rewrites = []

      for (const route of routes) {
        if (route.pattern !== route.page) {
          rewrites.push({
            source: route.pattern,
            destination: route.page,
          })
        }
      }

      return rewrites
    },
  },
}
