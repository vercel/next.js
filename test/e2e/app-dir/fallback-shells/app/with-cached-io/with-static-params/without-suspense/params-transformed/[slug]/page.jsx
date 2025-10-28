import { CachedLastModified } from '../../../../last-modified'

async function transformParams(params) {
  const { slug } = await params

  return { slug }
}

export default async function Page({ params }) {
  return <CachedLastModified params={transformParams(params)} />
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
