import { nextTestSetup } from 'e2e-utils'

describe('file-loader-wasm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@duckdb/duckdb-wasm': '1.29.1-dev132.0',
      'file-loader': '^6.2.0',
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
