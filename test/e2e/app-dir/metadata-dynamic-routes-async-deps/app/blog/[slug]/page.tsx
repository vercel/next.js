import { getAllSlugs } from '../../data'

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>Post: {slug}</p>
}
