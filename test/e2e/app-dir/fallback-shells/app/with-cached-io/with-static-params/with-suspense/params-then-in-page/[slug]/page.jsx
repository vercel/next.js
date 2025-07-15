import { CachedLastModified } from '../../../../last-modified'

export default async function Page({ params }) {
  return (
    <>
      <CachedLastModified params={params.then((p) => ({ slug: p.slug }))} />
      <CachedLastModified params={params.catch(() => {})} />
      <CachedLastModified params={params.finally(() => {})} />
      <CachedLastModified params={params.finally().catch()} />
    </>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
