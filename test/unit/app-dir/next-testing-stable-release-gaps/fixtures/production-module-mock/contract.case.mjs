import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
vi.mock('./subject.mjs', () => ({ value: 42 }))
test('factory mocks production compiled entry', () => expect(value).toBe(42))
