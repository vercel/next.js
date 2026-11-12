import { test, expect } from 'vitest'
import { value } from './subject.mjs'
test('dependent test', () => expect(value).toBe(42))
