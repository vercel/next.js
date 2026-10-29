import { connection } from 'next/server'

export default async function Page() {
  await connection()
  const loaded = Reflect.get(
    globalThis,
    Symbol.for('next.test.proxy-unmatched-startup')
  )
  return <p id="proxy-state">{loaded ? 'loaded' : 'cold'}</p>
}
