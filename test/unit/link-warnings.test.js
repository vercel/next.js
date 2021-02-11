/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import Link from 'next/link'

describe('<TestComponent/>', () => {
  let spy
  beforeAll(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('test a', () => {})

  it('test link', () => {
    let result
    act(() => {
      result = render(
        <div>
          <p>Hello</p>
          <Link href="nowhere">hello</Link>
        </div>
      )
    })

    expect(result).toBeDefined()
    expect(spy).not.toHaveBeenCalled()
  })

  afterAll(() => {
    spy.mockRestore()
  })
})
