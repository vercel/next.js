/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import dynamic from 'next/dynamic'

describe('next/dynamic', () => {
  it('test dynamic with jest', () => {
    const App = dynamic(() => import('./fixtures/stub-components/hello'))

    act(() => {
      const { unmount } = render(<App />)
      unmount()
    })
  })
})
