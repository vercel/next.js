/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import Link from 'next/link'

describe('<Link/>', () => {
  let spy
  beforeAll(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('test link with unmount', () => {
    act(() => {
      const { unmount } = render(<Link href="/">hello</Link>)
      unmount()
    })

    expect(spy).not.toHaveBeenCalled()
  })

  it('test link without unmount', () => {
    act(() => {
      render(<Link href="/">hello</Link>)
    })

    expect(spy).not.toHaveBeenCalled()
  })

  afterAll(() => {
    spy.mockRestore()
  })
})
