import { CachedLastModified } from '../../../last-modified'

export default async function Page({ params }) {
  return (
    <>
      <CachedLastModified params={params.then((p) => p)} />
      <CachedLastModified params={params.catch(() => {})} />
      <CachedLastModified params={params.finally(() => {})} />
    </>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
