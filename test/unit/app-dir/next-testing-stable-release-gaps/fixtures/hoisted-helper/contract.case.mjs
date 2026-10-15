import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
const injected = vi.hoisted(() => ({ value: 42 }))
vi.mock('./subject.mjs', () => injected)
test('hoisted binding is available to factory', () => expect(value).toBe(42))
