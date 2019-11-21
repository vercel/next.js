/* global describe, it */
import { shallow } from 'enzyme'
import React from 'react'
import expect from 'expect.js'

import App from '../pages/index.js'

describe('With Enzyme', () => {
  it('App shows "Hello world!"', () => {
    const app = shallow(<App />)

    expect(app.find('p').text()).to.equal('Hello World!')
  })
})
