import { nextTestSetup } from 'e2e-utils'

describe('turbopack-defer-module-evaluation', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('evaluates a module without side effects when one of its exports is first used', async () => {
    const first = await (await next.fetch('/api/modules')).json()
    // A module with side effects is evaluated before the route module, whether it is used or not.
    expect(first.before).toContain('with-side-effect')
    expect(first.values).toEqual(['with-side-effect', null])

    if (isTurbopack) {
      // Nothing read an export of the side-effect-free module yet.
      expect(first.after).toEqual(['with-side-effect'])
    } else {
      // Other bundlers evaluate every import before the route module.
      expect(first.after).toEqual(
        expect.arrayContaining(['with-side-effect', 'side-effect-free'])
      )
    }

    const second = await (await next.fetch('/api/modules?use')).json()
    expect(second.before).toEqual(first.after)
    expect(second.values).toEqual(['with-side-effect', 'side-effect-free'])
    expect([...second.after].sort()).toEqual([
      'side-effect-free',
      'with-side-effect',
    ])

    // Evaluated once.
    const third = await (await next.fetch('/api/modules?use')).json()
    expect(third.before).toEqual(second.after)
    expect(third.after).toEqual(second.after)
  })
})
