import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'

async function Inner() {
  'use cache'

  // This should lower the default cache lives of the outer cache scopes.
  cacheLife({ revalidate: 180, expire: 300 })
  cacheTag('inner')

  return <p id="inner">{Math.random()}</p>
}

async function Outer1() {
  'use cache'

  cacheTag('outer1')

  return Inner()
}

async function Outer2() {
  'use cache'

  cacheTag('outer2')

  return Inner()
}

export default async function Page() {
  await connection()

  const first = await Outer1()
  const second = await Outer2()

  return (
    <>
      {first}
      {second}
    </>
  )
}
