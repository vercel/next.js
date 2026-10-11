import { beforeEach } from 'vitest'

export const setupValue = 'first'
export let setupCalls = 0
beforeEach(() => {
  setupCalls++
})
