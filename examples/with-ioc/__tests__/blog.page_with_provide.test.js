/* eslint-env jest */

/*
 * Testing pages with @provide decorator:
 *
 * Snapshots – as usual
 *
 * Shallow rendering – need to `.dive()` one level deep,
 * as with any High Order Component.
 * Also `.html()` may cause havoc when it'd try to expand the render
 * but won't inject context since top level co,ponent has been rendered already.
 * This problem is not unique to IoC though, anything that relies on context (i.e. Redux)
 * is facing the same issue. Use `.debug()` or `mount()` instead
 */

import { shallow } from 'enzyme'
import React from 'react'
import renderer from 'react-test-renderer'

import App from '../pages/blog.js'

describe('With Enzyme', () => {
  it('Blog renders components', () => {
    const app = shallow(<App post={{title: 'Hi There!'}} />).dive()
    expect(app.find('h1').text()).toEqual('Hi There!')
  })
})

describe('With Snapshot Testing', () => {
  it('Blog renders components', () => {
    const component = renderer.create(<App post={{title: 'Hi There!'}} />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
