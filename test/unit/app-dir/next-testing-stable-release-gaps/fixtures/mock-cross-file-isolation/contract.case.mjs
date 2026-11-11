import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
vi.mock('./subject.mjs', () => ({ value: () => 42 }))
test('first file owns mock', () => expect(value()).toBe(42))
