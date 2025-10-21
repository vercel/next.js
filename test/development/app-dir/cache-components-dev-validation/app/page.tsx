import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  console.log('Page')
  return (
    <main>
      <h1>repro</h1>
      {/* <Suspense fallback={<div>Loading...</div>}> */}
      <Child />
      {/* </Suspense> */}
      {/* <Suspense fallback={<div>Loading...</div>}> */}
      <Child2 />
      {/* </Suspense> */}
    </main>
  )
}

async function Child() {
  console.log('Child - before cookies')
  await cookies()
  console.log('Child - after cookies')
  return <Nested />
}

async function Child2() {
  console.log('Child2 - before connection')
  await connection()
  console.log('Child2 - after connection')
  return <Nested />
}

function Nested() {
  console.log('Nested')
  return 'Content'
}

// async function cached() {
//   "use cache"
//   await new Promise((resolve) => setTimeout(resolve))
//   return Date.now()
// }
