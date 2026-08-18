import { notFound } from 'next/navigation'

const prerenderedSlugs = ['known']
const runtimeSlugs = ['runtime']

export const instant = false

export function generateStaticParams() {
  return prerenderedSlugs.map((slug) => ({ slug: [slug] }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const pathname = slug?.join('/') ?? ''

  if (
    !prerenderedSlugs.includes(pathname) &&
    !runtimeSlugs.includes(pathname)
  ) {
    notFound()
  }

  return <p id="blocking-slug">{pathname}</p>
}
