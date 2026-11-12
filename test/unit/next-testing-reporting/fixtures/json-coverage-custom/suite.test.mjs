import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
test('completed body', () => expect(choose(true)).toBe(1))
