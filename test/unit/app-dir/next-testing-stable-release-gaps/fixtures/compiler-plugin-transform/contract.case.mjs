import { test, expect } from 'vitest'
import { value } from './subject.mjs'
test('actual application transform', () => expect(value).toBe(2))
