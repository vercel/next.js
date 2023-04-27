'use client'

import { useEffect } from 'react'

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
      it('should run', () => {})
    })
    return () => {}
  }, [])
}
