import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense>
      <ProxyState />
    </Suspense>
  )
}

async function ProxyState() {
  await connection()
  const loaded = Reflect.get(
    globalThis,
    Symbol.for('next.test.proxy-unmatched-startup')
  )
  return <p id="proxy-state">{loaded ? 'loaded' : 'cold'}</p>
}
