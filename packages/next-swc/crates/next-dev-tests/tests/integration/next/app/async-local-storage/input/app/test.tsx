'use client'

import { useEffect } from 'react'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(() => {
    it('should run', () => {})
  })
}
