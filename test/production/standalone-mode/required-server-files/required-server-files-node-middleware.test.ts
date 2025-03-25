process.env.TEST_NODE_MIDDLEWARE = '1'

if (process.env.TURBOPACK) {
  it('should skip for now', () => {})
} else {
  require('./required-server-files.test')
}
