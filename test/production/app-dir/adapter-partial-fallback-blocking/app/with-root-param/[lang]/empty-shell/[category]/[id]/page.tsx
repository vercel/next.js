// Empty-shell variant under a root param: the params are read outside of
// any Suspense boundary, so the postpone propagates to the root and every
// build-time shell is empty. `instant = false` opts the route out of
// requiring an instant (non-empty) shell.
//
// `generateStaticParams` provides `lang` in every entry (required for root
// params) and partially covers `category`; `id` is never provided, so `id`
// must never be resolved into a cached shell and must never be part of a
// cache key — including for requests whose `lang` value was not enumerated
// (e.g. /fr/...), which match the base route entry where `lang` is an
// unresolved root param.
export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'en', category: 'shoes' }]
}

export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string; id: string }>
}) {
  const { lang, category, id } = await params

  // Per-render marker (prerenderable): must be re-rendered per request and
  // never repeat across fetches — a repeated value proves a stored render
  // is being replayed from the cache.
  const renderedAt = performance.now()

  return (
    <div>
      <div id="lang">{lang}</div>
      <div id="category">{category}</div>
      <div id="id">{id}</div>
      <div id="rendered-at">{renderedAt}</div>
    </div>
  )
}
