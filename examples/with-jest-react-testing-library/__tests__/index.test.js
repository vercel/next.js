/* eslint-env jest */

import React from 'react'
import { render } from 'react-testing-library'

import App from '../pages/index.js'

describe('With React Testing Library', () => {
  it('Shows "Hello world!"', () => {
    const { getByText } = render(<App />)

    expect(getByText('Hello World!')).not.toBeNull()
  })
})

describe('With React Testing Library Snapshot', () => {
  it('Should match Snapshot', () => {
    const { asFragment } = render(<App />)

    expect(asFragment()).toMatchSnapshot()
  })
})
