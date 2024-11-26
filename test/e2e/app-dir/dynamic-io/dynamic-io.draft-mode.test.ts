import { nextTestSetup } from 'e2e-utils'

describe('dynamic-io', () => {
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
    let $ = await next.render$('/draftmode/async', {})
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

    $ = await next.render$('/draftmode/sync', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('Route "/draftmode')).toEqual([
        expect.stringContaining('`draftMode().isEnabled`'),
        // TODO need to figure out why deduping isn't working here
        expect.stringContaining('`draftMode().isEnabled`'),
        // TODO need to figure out why deduping isn't working here
        expect.stringContaining('`draftMode().isEnabled`'),
      ])
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('Route "/draftmode')).toEqual([])
    }
  })
})
