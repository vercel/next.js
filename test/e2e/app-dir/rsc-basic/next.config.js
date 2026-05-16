module.exports = {
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  serverExternalPackages: ['conditional-exports-optout'],
  rewrites: async () => {
    return {
      afterFiles: [
        {
          source: '/rewritten-to-edge-dynamic',
          destination: '/edge/dynamic',
        },
      ],
    }
  },
}
