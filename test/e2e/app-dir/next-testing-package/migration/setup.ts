import { beforeEach, expect } from 'vitest'
import { helperExpect, installMatchers, shared } from './shared-matchers.js'

expect(helperExpect).toBe(expect)
shared.setupCalls++
installMatchers()
beforeEach(() => {
  shared.beforeEachCalls++
})
