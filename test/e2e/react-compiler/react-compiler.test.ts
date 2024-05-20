import { nextTestSetup, FileRef } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe.each(
  ['default', process.env.TURBOPACK ? undefined : 'babelrc'].filter(Boolean)
)('react-compiler %s', (variant) => {
  const { next } = nextTestSetup({
    files:
      variant === 'babelrc'
        ? __dirname
        : {
            app: new FileRef(join(__dirname, 'app')),
            'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
          },

    dependencies: {
      'babel-plugin-react-compiler': '0.0.0-experimental-4690415-20240515',
    },
  })

  it('should show an experimental warning', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain('Experiments (use with caution)')
      expect(next.cliOutput).toContain('reactCompiler')
    })
  })

  it('should render', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const text = await browser
        .elementByCss('#react-compiler-enabled-message')
        .text()
      expect(text).toMatch(/React compiler is enabled with \d+ memo slots/)
    })
  })
})
