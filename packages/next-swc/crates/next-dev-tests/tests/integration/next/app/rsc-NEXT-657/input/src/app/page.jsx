'use client'

import { useEffect } from 'react'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'

export default function Home() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(runTests)
  }, [])
  return 'index'
}

function runTests() {
  it('should include RSC vary for app route', async () => {
    const res = await fetch('/app')

    expect(res.headers.get('vary')).toBe(RSC_VARY_HEADER)

    const text = await res.text()
    expect(text).toContain('<html')
    expect(text).toContain('app')
  })

  it('should include RSC vary for flight route', async () => {
    const res = await fetch('/app', {
      headers: {
        RSC: 1,
      },
    })

    expect(res.headers.get('vary')).toBe(RSC_VARY_HEADER)

    const text = await res.text()
    expect(text).not.toContain('<html')
    expect(text).toContain('app')
  })

  it('should not include RSC vary for page route', async () => {
    const res = await fetch('/page')

    const vary = res.headers.get('vary') || ''
    expect(vary.split(/\s*,\s*/g)).not.toContain('RSC')

    const text = await res.text()
    expect(text).toContain('<html')
    expect(text).toContain('page')
  })
}
