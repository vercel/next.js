/* global it, expect */
import React from 'react'
import { shallow } from 'enzyme'
import App from '../pages/index.js'

it('App shows "Hello world!"', () => {
  const app = shallow(
    <App />
  )

  expect(app.find('p').text()).toEqual('Hello world!')
})
