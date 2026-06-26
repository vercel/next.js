import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliIndex = 0
  beforeEach(() => {
    cliIndex = next.cliOutput.length
  })
  function getLines(containing: string): Array<string> {
    const warnings = next.cliOutput
      .slice(cliIndex)
      .split('\n')
      .filter((l) => l.includes(containing))

    cliIndex = next.cliOutput.length
    return warnings
  }

  it('should fully prerender pages that use draftMode', async () => {
    expect(getLines('Route "/draftmode')).toEqual([])
    let $ = await next.render$('/draftmode', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('Route "/draftmode')).toEqual([])
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('Route "/draftmode')).toEqual([])
    }
  })

  if (!isNextDev) {
    it('should stream Suspense fallbacks when draft mode is enabled', async () => {
      const draftRes = await next.fetch('/draftmode/toggle')
      const setCookie = draftRes.headers.get('set-cookie')
      const cookieHeader = { Cookie: setCookie?.split(';', 1)[0] }

      expect(cookieHeader.Cookie).toBeTruthy()

      const $ = await next.render$('/draftmode/streaming', undefined, {
        headers: cookieHeader,
      })

      expect($('#draft-mode').text()).toBe('true')
      expect($('#delayed-runtime-fallback').text()).toBe(
        'Loading draft content...'
      )
    })
  }
})
