import { nextTestSetup } from 'e2e-utils'

describe('next-codemod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { '@next/codemod': 'canary' },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    console.log({
      fofo: require.resolve('@next/codemod/bin/next-codemod.js', {
        paths: [next.testDir],
      }),
    })
    expect($('p').text()).toBe('hello world')
  })
})
