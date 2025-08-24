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

async function Dynamic() {
  await connection()
  return null
}

export default async function Page() {
  await outermost('outer')
  await innermost('inner')

  return (
    <Suspense>
      <Dynamic />
    </Suspense>
  )
}
