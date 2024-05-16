import { nextTestSetup, FileRef } from 'e2e-utils'
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

  it('should render', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toMatch(
      /React compiler is enabled with .+ memo slots/
    )
  })
})
