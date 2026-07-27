import React from 'react'
import { renderToString } from 'react-dom/server'
import * as nextRouter from 'next/router'

import { Foo } from './fixture'

// @ts-expect-error
jest.spyOn(nextRouter, 'useRouter').mockReturnValue({
  pathname: 'Hello',
})

test('mock the interpolated modules should work', () => {
  expect(renderToString(<Foo />)).toBe(`<div>Hello</div>`)
})
