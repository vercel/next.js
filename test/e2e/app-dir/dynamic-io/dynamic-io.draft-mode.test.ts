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
    expect(getLines('In route /draftmode')).toEqual([])
    let $ = await next.render$('/draftmode/async', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('In route /draftmode')).toEqual([])
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('In route /draftmode')).toEqual([])
    }

    $ = await next.render$('/draftmode/sync', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('In route /draftmode')).toEqual([
        expect.stringContaining(
          'a `draftMode()` property was accessed directly with `draftMode().isEnabled`.'
        ),
      ])
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#draft-mode').text()).toBe('false')
      expect(getLines('In route /draftmode')).toEqual([])
    }
  })
})
