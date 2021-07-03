/**
 * @jest-environment jsdom
 */
import React from 'react'
import { act, render } from '@testing-library/react'
import dynamic from 'next/dynamic'

describe('next/dynamic', () => {
  it('test link with unmount', () => {
    const App = dynamic(() => import('./fixtures/stub-components/hello'))
    act(() => {
      const { unmount } = render(<App />)
      unmount()
    })
  })
})
