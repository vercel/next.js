import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-set-environment-variable', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      TEST_THIS_THING: 'def',
    },
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('loader that sets an environment variable should work', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
    expect($('#the-svg').text()).toBe('The svg rendered')
  })
})
