/**
 * @jest-environment jsdom
 */
import React from 'react'
// eslint-disable-next-line react/no-deprecated
import { render, unmountComponentAtNode } from 'react-dom'
import { act } from 'react-dom/test-utils'

import Hello from '../components/hello'

describe('Link without a router', () => {
  let container = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    unmountComponentAtNode(container)
    container.remove()
    container = null
  })

  describe('dev mode', () => {
    it('should not throw when rendered', () => {
      jest.useFakeTimers()

      act(() => {
        render(<Hello />, container)
      })

      act(() => {
        jest.runAllTimers()
      })

      expect(container.textContent).toBe('Click me')
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should not throw when rendered', () => {
      jest.useFakeTimers()

      act(() => {
        render(<Hello />, container)
      })

      act(() => {
        jest.runAllTimers()
      })

      expect(container.textContent).toBe('Click me')
    })
  })
})
