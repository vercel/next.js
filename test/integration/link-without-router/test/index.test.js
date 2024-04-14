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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
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
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      // eslint-disable-next-line jest/no-identical-title
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
    }
  )
})
