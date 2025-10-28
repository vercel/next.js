import { CachedLastModified } from '../../../../last-modified'

export default async function Page({ params }) {
  return <CachedLastModified params={params} />
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
