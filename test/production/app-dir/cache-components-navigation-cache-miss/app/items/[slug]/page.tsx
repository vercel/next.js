import { existsSync, writeFileSync } from 'node:fs'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { prerenderGate } from '../../prerender-gate'

export function generateStaticParams() {
  return [
    'static',
    'becomes-partial',
    'concurrent',
    'async',
    'not-found',
    'redirect',
  ].map((slug) => ({ slug }))
}

async function Caller() {
  const cookieStore = await cookies()
  const caller = cookieStore.get('caller')?.value ?? 'none'
  if (
    cookieStore.get('test-case')?.value === 'expiration' &&
    existsSync('expiration.hold') &&
    !existsSync('expiration.release')
  ) {
    writeFileSync('expiration.rendered-before-release', '')
  }
  return <p id="caller">{'Caller: ' + caller}</p>
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await prerenderGate(slug)
  if (existsSync(slug + '.not-found')) {
    notFound()
  }
  if (existsSync(slug + '.redirect')) {
    redirect('/items/static')
  }
  return (
    <>
      <p id="slug">{'Item: ' + slug}</p>
      {slug === 'async' ||
      slug === 'required' ||
      existsSync(slug + '.cookies') ? (
        <Caller />
      ) : null}
    </>
  )
}

export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p id="loading">Loading item</p>}>
      <Content {...props} />
    </Suspense>
  )
}
