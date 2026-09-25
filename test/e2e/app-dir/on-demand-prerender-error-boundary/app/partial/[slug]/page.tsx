import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getData, getTransientData } from '../../../test-data'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

async function Content({ slug, pathname }: { slug: string; pathname: string }) {
  if (slug.startsWith('transient-')) {
    const value = await getTransientData(pathname)
    return <p id="content">{value}</p>
  }

  if (slug.startsWith('recovery-')) {
    const value = await getData(slug)
    if (value === 'error') {
      throw new Error('Partial prerender application data is unavailable')
    }
    return <p id="content">{value}</p>
  }

  if (slug.startsWith('reported-')) {
    throw new Error(`Reported partial prerender error: ${slug}`)
  }

  if (slug.endsWith('missing')) {
    notFound()
  }
  throw new Error('Partial prerender application error')
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'prerendered' || slug === 'healthy') {
    return <p>Healthy page</p>
  }

  const withSuspense = slug.startsWith('suspense-')
  const content = (
    <Content
      slug={withSuspense ? slug.slice('suspense-'.length) : slug}
      pathname={`/partial/${slug}`}
    />
  )
  return withSuspense ? (
    <Suspense fallback={<p>Page loading</p>}>{content}</Suspense>
  ) : (
    content
  )
}
