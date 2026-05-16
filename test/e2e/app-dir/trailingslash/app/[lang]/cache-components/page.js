import SharedPage from '../shared-page'

// This page is compatible with Cache Components. It does not define a
// `revalidate` route segment config, and uses 'use cache' instead. The path is
// rewritten to here from /:lang(en|es)/ via rewrites in next.config.js when
// __NEXT_CACHE_COMPONENTS is set to true.

export default async function Page({ params }) {
  'use cache'

  return <SharedPage params={params} />
}
