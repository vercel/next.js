/* global fixture, test */
import 'testcafe'
import { Component } from 'react'
import { getDisplayName } from 'next/dist/next-server/lib/utils'

fixture('getDisplayName')

test('gets the proper display name of a component', async t => {
  class ComponentOne extends Component {
    render () {
      return null
    }
  }

  class ComponentTwo extends Component {
    static displayName = 'CustomDisplayName'
    render () {
      return null
    }
  }

  function FunctionalComponent () {
    return null
  }

  await t.expect(getDisplayName(ComponentOne)).eql('ComponentOne')
  await t.expect(getDisplayName(ComponentTwo)).eql('CustomDisplayName')
  await t.expect(getDisplayName(FunctionalComponent)).eql('FunctionalComponent')
  await t.expect(getDisplayName(() => null)).eql('Unknown')
  await t.expect(getDisplayName('div')).eql('div')
})
