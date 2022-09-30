/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import Link from 'next/link'
import React from 'react'

describe('<Link/>', () => {
  let spy
  let expectedErrors
  beforeAll(async () => {
    spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      console.log(...args)
    })

    expectedErrors = 0
  })

  it('test link with unmount', () => {
    act(() => {
      const { unmount } = render(<Link href="/">hello</Link>)
      unmount()
    })

    expect(spy).toHaveBeenCalledTimes(expectedErrors)
  })

  it('test link without unmount', () => {
    act(() => {
      render(<Link href="/">hello</Link>)
    })

    expect(spy).toHaveBeenCalledTimes(expectedErrors)
  })

  afterAll(() => {
    spy.mockRestore()
  })
})
