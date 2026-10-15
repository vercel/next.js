import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
test('only true branch is executed', () => expect(choose(true)).toBe(1))
