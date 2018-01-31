/* eslint-env jest */

/*
 * Testing pages without @provide decorator as usual
 */

import { shallow } from 'enzyme'
import React from 'react'
import renderer from 'react-test-renderer'

import App from '../pages/index.js'

describe('With Enzyme', () => {
  it('App shows "Menu"', () => {
    const app = shallow(<App />)
    expect(app.find('li a').first().text()).toEqual('Blog: Hello world')
  })
})

describe('With Snapshot Testing', () => {
  it('App shows "Menu"', () => {
    const component = renderer.create(<App />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
