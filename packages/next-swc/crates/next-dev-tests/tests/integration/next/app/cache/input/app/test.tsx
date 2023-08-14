'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(() => {
    it('should cache with unstable_cache', () => {
      let value1 = document.getElementById('value1').textContent
      let value2 = document.getElementById('value2').textContent
      expect(value1).toBe(value2)
      expect(value1).not.toBe('')
    })
  })
}
