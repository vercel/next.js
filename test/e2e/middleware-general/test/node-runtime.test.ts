process.env.TEST_NODE_MIDDLEWARE = 'true'

if (process.env.TURBOPACK) {
  it('should skip', () => {})
} else {
  require('./index.test')
}
