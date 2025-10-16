import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import { Suspense } from 'react'

async function outermost(id: string) {
  'use cache'
  return id + middle('middle')
}

async function middle(id: string) {
  'use cache'
  return id + innermost('inner')
}

async function innermost(id: string) {
  'use cache'
  return id
}

async function Short({ id }: { id: string }) {
  'use cache'
  cacheLife('seconds')
  return id
}

async function Dynamic() {
  await connection()
  return null
}

async function CachedStuff() {
  await outermost('outer')
  await innermost('inner')

  return (
    <Suspense>
      <Short id="short" />
    </Suspense>
  )
}

export default function Page() {
  return (
    <div>
      <CachedStuff />
      <Suspense>
        <Dynamic />
      </Suspense>
    </div>
  )
}
