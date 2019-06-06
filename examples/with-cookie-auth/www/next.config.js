module.exports = {
  target: 'serverless',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3000'
  }
}
