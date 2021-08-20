/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import Link from 'next/link'
import React from 'react'
import { getPackageVersion } from 'next/dist/lib/get-package-version'
import semver from 'next/dist/compiled/semver'

describe('<Link/>', () => {
  let spy
  let expectedErrors
  beforeAll(async () => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const reactVersion = await getPackageVersion({
      cwd: __dirname,
      name: 'react-dom',
    })
    expectedErrors = reactVersion && semver.gte(reactVersion, '18.0.0') ? 1 : 0
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
