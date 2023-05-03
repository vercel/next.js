import Link from 'next/link'
import '@/styles/a.css'
import { useEffect } from 'react'

export default function A() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then((harness) =>
      harness.markAsHydrated()
    )
    globalThis.DYNAMIC_IMPORT1 = () => import('../lib/dynamic1.js')
    globalThis.DYNAMIC_IMPORT2 = () => import('../lib/dynamic2.js')
  })

  return (
    <>
      <Link className="b" href="/b">
        B
      </Link>
      <button className="a" onClick={() => DYNAMIC_IMPORT1()}>
        Load dynamic styles 1
      </button>
      <button className="b" onClick={() => DYNAMIC_IMPORT2()}>
        Load dynamic styles 2
      </button>
    </>
  )
}
