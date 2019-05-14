/* eslint-env jest */

import { shallow } from 'enzyme'
import React from 'react'
import renderer from 'react-test-renderer'

import App from '../pages/index.js'

describe('With Enzyme', () => {
  it('App shows "Hello World"', () => {
    const app = shallow(<App />)

    expect(app.find('div').text()).toEqual('Hello World')
  })
})

describe('With Snapshot Testing', () => {
  it('App shows "Hello World"', () => {
    const component = renderer.create(<App />)
    const tree = component.toJSON()
    expect(tree).toMatchSnapshot()
  })
})
