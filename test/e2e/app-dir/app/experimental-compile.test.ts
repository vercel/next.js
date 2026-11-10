import { isNextStart } from 'e2e-utils'

process.env.NEXT_EXPERIMENTAL_COMPILE = '1'

if (isNextStart) {
  require('./index.test')
} else {
  it('should skip', () => {})
}
