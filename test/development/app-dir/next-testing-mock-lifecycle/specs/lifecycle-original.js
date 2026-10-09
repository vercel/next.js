import { expect, test } from 'vitest'
import { value } from '../dependency'

test('the file after a failed factory sees original values and fresh globals', () => {
  expect(value).toBe('original')
  expect(globalThis.__lifecycleDirty).toBeUndefined()
  expect(globalThis.__lifecycleRelease).toBeUndefined()
  process.stdout.write(
    'LIFECYCLE_ORIGINAL=' + JSON.stringify({ value, pid: process.pid }) + '\n'
  )
})
