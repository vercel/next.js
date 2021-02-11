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

  // Commenting out "test a" makes the problem go away.
  // This fails with NextJS 10.x, but works with 9.5.6.
  it('test a', () => {})

  it('test c', () => {
    act(() => {
      render(
        <div>
          <p>Hello</p>
          <Link href="nowhere">hello</Link>
        </div>
      )
    })

    expect(spy).not.toHaveBeenCalled()
  })

  afterAll(() => {
    spy.mockRestore()
  })
})
