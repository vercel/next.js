import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate turbopack
describe('turbopack-loader-change', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should re-run the loader with the new code when a loader dependency changes', async () => {
    const $ = await next.render$('/')
    expect($('#a').text()).toBe('one:alpha')
    expect($('#b').text()).toBe('one:beta')

    await next.patchFile(
      'loader-prefix.js',
      "module.exports = { prefix: 'two' }\n",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/')
          expect($2('#a').text()).toBe('two:alpha')
          expect($2('#b').text()).toBe('two:beta')
        })
      }
    )

    await retry(async () => {
      const $3 = await next.render$('/')
      expect($3('#a').text()).toBe('one:alpha')
      expect($3('#b').text()).toBe('one:beta')
    })
  })
})
