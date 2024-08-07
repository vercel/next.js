import { nextTestSetup } from 'e2e-utils'

describe('app-dir assetPrefix full URL', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (isNextDev) {
    it('should not break HMR', async () => {
      await next.patchFile('next.config.js', (content) =>
        content.replace('undefined', `'http://localhost:${next.appPort}'`)
      )

      const $ = await next.render$('/')
      expect($('p').text()).toBe('before edit')

      await next.patchFile('app/page.tsx', (content) =>
        content.replace('before', 'after')
      )

      const $2 = await next.render$('/')
      expect($2('p').text()).toBe('after edit')
    })
  }

  it('should build correctly when assetPrefix is undefined', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('before edit')
  })
})
