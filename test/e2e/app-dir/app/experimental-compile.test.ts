import 'e2e-utils'

process.env.NEXT_EXPERIMENTAL_COMPILE = '1'

if ((global as any).isNextStart) {
  require('./index.test')
} else {
  it('should skip', () => {})
}
