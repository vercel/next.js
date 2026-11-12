import { test, expect } from 'vitest'
import { value as specific } from '@root/specific/value.mjs'
import { value as broad } from '@root/ordinary.mjs'
import { value as shadow } from '@root/shadow/value.mjs'
import * as direct from './specific/value.mjs'
test('ordered string aliases preserve first matching prefix and native identity', async () => {
  expect([specific, broad, shadow]).toEqual([11, 22, 33])
  expect(await import('@root/specific/value.mjs')).toBe(direct)
})
