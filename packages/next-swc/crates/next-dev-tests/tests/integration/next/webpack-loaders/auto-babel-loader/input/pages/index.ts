import { useEffect } from 'react'
import other from '../other'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return null
}

function runTests() {
  it('automatically runs babel-loader if a babel config is present', () => {
    expect(other).toBe('foo')
  })
}
