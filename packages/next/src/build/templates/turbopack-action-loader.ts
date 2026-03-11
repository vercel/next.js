// @ts-expect-error doesn't know about __turbopack_collect__
__turbopack_collect__({
  namespace: 'next/server-actions',
})

// There is no runtime behavior needed here.
// - __turbopack_collect__ causes all modules to chunked together with this one
// - server-reference-manifest.json will contains all the module ids from above. It will do the loading itself
// In the future, when server-reference-manifest might be loaded/handled by the templates themselves, then it could happen here instead.
