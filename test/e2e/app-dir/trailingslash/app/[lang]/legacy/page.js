import SharedPage from '../shared-page'

// This page uses the legacy `revalidate` route segment config instead of 'use
// cache'. The path is rewritten to here from /:lang(en|es)/ via rewrites in
// next.config.js when __NEXT_CACHE_COMPONENTS is not set.

export const revalidate = 900

export default SharedPage
