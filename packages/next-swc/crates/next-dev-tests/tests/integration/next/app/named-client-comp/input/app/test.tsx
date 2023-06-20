'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export function Test() {
  useTestHarness(() => {
    it('should allow to import a named export from a client component', () => {})
  }, [])
}
