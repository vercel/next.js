import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ locale: string; slug: string[] }> }

export function generateStaticParams() {
  return [{ locale: 'en', slug: ['known'] }]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return slug.join('/') === 'known' ? { title: 'Known page' } : {}
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  if (slug.join('/') !== 'known') notFound()
  return (
    <>
      <h1>Known page</h1>
      <Link href="/en/client-missing" id="missing">
        Missing
      </Link>
    </>
  )
}
