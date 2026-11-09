import { Hero } from '../hero'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <Hero id={slug} />
}
