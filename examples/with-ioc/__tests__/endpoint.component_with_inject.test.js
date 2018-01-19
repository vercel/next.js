/* eslint-env jest */

/*
 * Individual component testing is pretty simple
 * just provide your dependencies as props
 * and add `.dive()` step to your shallow render,
 * as with any High Order Component.
 *
 * Remarks about `.html()` may apply,
 * depending if any of the children components
 * expect anything from the context
 */

import { shallow } from 'enzyme'
import React from 'react'
import renderer from 'react-test-renderer'

import Component from '../components/endpoint.js'

describe('With Enzyme', () => {
  it('Component renders with props', () => {
    // no need to mock Link component much for shallow rendering
    const injected = shallow(<Component Link={() => {}} />)
    const component = injected.dive()
    expect(component.find('h3').text()).toEqual('Endpoint')
    expect(component.find('Link').first().find('a').text()).toEqual('About: foo baz')
  })
})

describe('With Snapshot Testing', () => {
  it('Blog renders components', () => {
    const component = renderer.create(<Component Link={(props) => <div comment={'mocked Link component'}>{props.children}</div>} />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
