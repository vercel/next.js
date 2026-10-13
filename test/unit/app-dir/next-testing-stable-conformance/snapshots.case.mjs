import { test, expect } from 'vitest'
test('existing external snapshot', () =>
  expect({ value: 'portable' }).toMatchSnapshot())
test('existing inline snapshot', () =>
  expect({ value: 'portable' }).toMatchInlineSnapshot())
