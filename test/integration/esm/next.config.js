module.exports = {
  target: 'serverless',
  webpack: config => {
    config.node = { fs: 'empty' }
    return config
  }
}
