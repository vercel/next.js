module.exports = {
  experimental: {
    optimizeScripts: {
      enablePartytown: true,
      partytownConfig: {
        forward: ['dataLayer.push', 'fbq'],
      },
    },
  },
}
