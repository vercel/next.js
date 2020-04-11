import { shallow } from 'enzyme'
import React from 'react'

import App from '../pages/index'

describe('Simple Jest test', () => {
  it('Render base component without crashing', () => {
    const app = shallow(<App />)
    expect(app.find('title').text()).toEqual('Create Next App')
  })
})
