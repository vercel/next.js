import { Suspense } from 'react'
import { cacheLife } from 'next/cache'
import { connection } from 'next/server'

export default function DotEnvInspector() {
  return (
    <div data-testid="inspect-env">
      <StaticInspector />
      <Suspense fallback={<div>dynamic ENV_FILE_KEY: Loading...</div>}>
        <DynamicInspector />
      </Suspense>
      <CachedInspector />
    </div>
  )
}

export function StaticInspector() {
  const dotenv = process.env.ENV_FILE_KEY

  return <div>static ENV_FILE_KEY: {dotenv == null ? 'undefined' : dotenv}</div>
}

export async function DynamicInspector() {
  await connection()

  const dotenv = process.env.ENV_FILE_KEY

  return (
    <div>dynamic ENV_FILE_KEY: {dotenv == null ? 'undefined' : dotenv}</div>
  )
}

export async function CachedInspector() {
  'use cache'

  // keep cache alive for a year
  cacheLife({
    expire: 31540000,
    revalidate: 31540000,
    stale: 31540000,
  })

  const dotenv = process.env.ENV_FILE_KEY

  return <div>cached ENV_FILE_KEY: {dotenv == null ? 'undefined' : dotenv}</div>
}
