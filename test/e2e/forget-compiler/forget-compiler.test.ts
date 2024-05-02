import { nextTestSetup, FileRef } from 'e2e-utils'
import { join } from 'path'

describe.each(['default', 'babelrc'])('forget-compiler %s', (variant) => {
  const { next } = nextTestSetup({
    files:
      variant === 'babelrc'
        ? __dirname
        : {
            app: new FileRef(join(__dirname, 'app')),
            'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
          },
  })

  it('should render', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toMatch(/Forget is enabled with .+ memo slots/)
  })
})
