import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
vi.mock('./subject.mjs')
test('manual mock is discovered', () => expect(value).toBe(42))
