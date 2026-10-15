import { test, expect } from 'vitest'
import { value } from './subject.mjs'
test('second file sees original', () => expect(value()).toBe(1))
