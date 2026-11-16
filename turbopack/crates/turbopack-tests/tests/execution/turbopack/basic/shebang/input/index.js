#!/usr/bin/env node

import { foo } from 'foo'

it('handles shebangs in the entry and in node_modules', () => {
  expect(foo(true)).toBe(true)
})
