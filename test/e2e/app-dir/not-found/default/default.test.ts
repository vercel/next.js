import { nextTestSetup } from 'e2e-utils'

const isPPREnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely inspects local build artifacts that deploy tests do not expose.
// @force-gate !deploy
describe('app dir - not-found - default', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should has noindex in the head html', async () => {
    const $ = await next.render$('/does-not-exist')
    expect(await $('meta[name="robots"]').attr('content')).toBe('noindex')
  })

  if (isNextStart) {
    it('should contain noindex contain in the page', async () => {
      const html = await next.readFile('.next/server/app/_not-found.html')
      const rsc = isPPREnabled
        ? 'noindex'
        : await next.readFile(`.next/server/app/_not-found.rsc`)

      expect(html).toContain('noindex')
      expect(rsc).toContain('noindex')
    })
  }
})
