/**
 * @jest-environment jsdom
 */
import { createElement } from 'react'
import { BailoutToCSRForNextDynamic } from './dynamic-bailout-to-csr'

// Simulates `react-dom` resolving to a React without `ReactDOM.browser`, which
// happens when React is shared with another app at runtime.
jest.mock('react-dom', () => {
  const { browser: _browser, ...reactDom } = jest.requireActual('react-dom')
  return reactDom
})

describe('BailoutToCSRForNextDynamic', () => {
  const originalFlag = process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT

  afterEach(() => {
    process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT = originalFlag
  })

  it('falls back to rendering children when ReactDOM.browser is missing', () => {
    process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT = 'true'
    const children = createElement('div')

    expect(BailoutToCSRForNextDynamic({ children })).toBe(children)
  })
})
