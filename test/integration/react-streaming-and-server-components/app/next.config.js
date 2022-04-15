module.exports = {
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  pageExtensions: ['js', 'ts', 'jsx'], // .tsx won't be treat as page,
  experimental: {
    serverComponents: true,
    runtime: 'edge',
  },
}
