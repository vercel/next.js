'use client'

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(runTests)
  }, [])
  return 'index'
}

function runTests() {
  it('should include RSC vary for app route', async () => {
    const res = await fetch('/app')

    const vary = res.headers.get('vary') || ''
    expect(vary.split(/\s*,\s*/g)).toContain('RSC')

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

    const vary = res.headers.get('vary') || ''
    expect(vary.split(/\s*,\s*/g)).toContain('RSC')

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
