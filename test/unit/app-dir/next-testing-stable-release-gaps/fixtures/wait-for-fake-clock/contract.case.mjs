import { test, expect, vi } from 'vitest'
test('waitFor advances fake clock', async () => {
  vi.useFakeTimers()
  let ready = false
  setTimeout(() => (ready = true), 80)
  await vi.waitFor(() => expect(ready).toBe(true), {
    interval: 20,
    timeout: 200,
  })
  vi.useRealTimers()
})
