import Link from 'next/link'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: ['known'] }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return slug.join('/') === 'known' ? { title: 'Known page title' } : {}
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  if (slug.join('/') !== 'known') notFound()
  return (
    <>
      <h1>Known page title</h1>
      <Link href="/client-missing" id="missing">
        Missing
      </Link>
    </>
  )
}
