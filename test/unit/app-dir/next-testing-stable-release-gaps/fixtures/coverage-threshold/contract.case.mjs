import { test, expect } from 'vitest'
import { choose } from './subject.mjs'
test('under threshold still executes test', () => expect(choose(true)).toBe(1))
