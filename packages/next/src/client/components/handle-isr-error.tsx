const workAsyncStorage =
  typeof window === 'undefined'
    ? (
        require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')
      ).workAsyncStorage
    : undefined

// if we are revalidating we want to re-throw the error so the
// function crashes so we can maintain our previous cache
// instead of caching the error page
export function HandleISRError({ error }: { error: any }) {
  if (workAsyncStorage) {
    const store = workAsyncStorage.getStore()
    if (store?.isRevalidate || store?.isStaticGeneration) {
      console.error(error)
      throw error
    }
  }

  return null
}
