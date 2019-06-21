module.exports = {
  target: 'serverless',
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60
  },
  experimental: {
    autoExport: true
  }
}
