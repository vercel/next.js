import * as constants from '../../../lib/constants'
import * as routerConstants from './constants'

describe('shared/lib/router/constants', () => {
  // `lib/constants` defines these values a second time for server and build
  // code. Its `satisfies` checks catch a changed literal. This test compares
  // the values of every export of this module, whatever their declared types.
  it('has the same values as lib/constants', () => {
    const serverValues = new Map<string, unknown>(Object.entries(constants))
    const names = Object.keys(routerConstants)
    expect(names.length).toBeGreaterThan(0)

    for (const [name, value] of Object.entries(routerConstants)) {
      expect([name, serverValues.get(name)]).toEqual([name, value])
    }
  })
})
