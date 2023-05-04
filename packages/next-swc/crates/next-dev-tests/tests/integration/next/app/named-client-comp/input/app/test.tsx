'use client'

import { useEffect } from 'react'

export function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => {
      it('should allow to import a named export from a client component', () => {})
    })
    return () => {}
  }, [])
}
