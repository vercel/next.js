import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'

type BackgroundProps = {
  searchParams: Promise<{ value?: string }>
}

export function createBackground(prefix: string, page: 'home' | 'about') {
  async function BackgroundContent({ searchParams }: BackgroundProps) {
    await connection()
    const { value } = await searchParams
    const search = value === undefined ? '' : `?value=${value}`
    const closePath = `${prefix}${page}${search}`
    return (
      <main>
        <h1 id="background-page">{page}</h1>
        <p id="background-value">{value ?? 'none'}</p>
        <p id="background-render">{randomUUID()}</p>
        <Link id="home" href={`${prefix}home${search}`} prefetch={false}>
          Home
        </Link>
        <Link
          id="about"
          href={`${prefix}about${value === undefined ? '' : '?value=second'}`}
          prefetch={false}
        >
          About
        </Link>
        <Link
          id="open-dialog"
          href={`/edit?closePath=${encodeURIComponent(closePath)}`}
          prefetch={false}
        >
          Edit
        </Link>
      </main>
    )
  }

  return function Background(props: BackgroundProps) {
    return (
      <Suspense fallback={null}>
        <BackgroundContent {...props} />
      </Suspense>
    )
  }
}
