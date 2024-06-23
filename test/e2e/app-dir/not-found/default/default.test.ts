import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found - default', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should has noindex in the head html', async () => {
    const $ = await next.render$('/does-not-exist')
    expect(await $('meta[name="robots"]').attr('content')).toBe('noindex')
  })

  if (isNextStart) {
    it('should contain noindex contain in the page', async () => {
      const html = await next.readFile('.next/server/app/_not-found.html')
      const rsc = await next.readFile('.next/server/app/_not-found.rsc')

      expect(html).toContain('noindex')
      expect(rsc).toContain('noindex')
    })
  }
})
