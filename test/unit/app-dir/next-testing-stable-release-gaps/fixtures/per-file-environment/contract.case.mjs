// @vitest-environment jsdom
import { test, expect } from 'vitest'
test('file pragma selects DOM realm', () =>
  expect(document.createElement('p').tagName).toBe('P'))
