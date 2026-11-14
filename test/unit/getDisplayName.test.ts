/* eslint-env jest */
import { Component } from 'react'
import { getDisplayName } from 'next/dist/shared/lib/utils'

describe('getDisplayName', () => {
  it('gets the proper display name of a component', () => {
    class ComponentOne extends Component {
      render() {
        return null
      }
    }

    class ComponentTwo extends Component {
      static displayName = 'CustomDisplayName'
      render() {
        return null
      }
    }

    function FunctionalComponent() {
      return null
    }

    expect(getDisplayName(ComponentOne)).toBe('ComponentOne')
    expect(getDisplayName(ComponentTwo)).toBe('CustomDisplayName')
    expect(getDisplayName(FunctionalComponent)).toBe('FunctionalComponent')
    expect(getDisplayName(() => null)).toBe('Unknown')
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    expect(getDisplayName('div' as any)).toBe('div')
  })
})
