import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe.each(['undefined', 'null'])(
  'Nullish configs set to %s in next.config.js',
  (value) => {
    const { next, isNextDev } = nextTestSetup({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
        'next.config.js': new FileRef(
          join(__dirname, 'configs', `${value}.js`)
        ),
      },
    })

    it('should ignore nullish config values', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')

      if (isNextDev) {
        expect(next.cliOutput).toMatch(/ready/i)
      } else {
        expect(next.cliOutput).toMatch(/Compiled successfully/i)
      }
    })
  }
)
