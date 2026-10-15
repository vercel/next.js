import { test, expect } from 'vitest'
import { value } from './subject.mjs'
test('affected test', () => expect(value).toBe(42))
