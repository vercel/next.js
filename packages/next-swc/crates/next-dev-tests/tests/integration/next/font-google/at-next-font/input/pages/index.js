import { useEffect } from 'react'
import { Inter } from '@next/font/google'

const interNoArgs = Inter()

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return <div className={interNoArgs.className}>Test</div>
}

function runTests() {
  it('continues to be able to import from `@next/font/google`', () => {
    expect(interNoArgs).toEqual({
      className: 'className__inter_34ab8b4d__7bdff866',
      style: {
        fontFamily: "'__Inter_34ab8b', '__Inter_Fallback_34ab8b'",
        fontStyle: 'normal',
      },
    })
  })
}
