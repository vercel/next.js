import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({ params }) {
  const { slug } = await params
  if (slug !== 'known') {
    notFound()
  }
  return <h1 id="known-item">{`Known item: ${slug}`}</h1>
}
