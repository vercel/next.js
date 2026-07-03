const workAsyncStorage =
  typeof window === 'undefined'
    ? // prettier-ignore
      (
        // TODO(browser-variant): migrate to a .ts/.browser.ts split so the browser bundle drops the server branch; see scripts/generate-browser-variant-aliases.mjs
        // ast-grep-ignore: no-typeof-window-require-tsx
        require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')
      ).workAsyncStorage
    : undefined

// if we are revalidating we want to re-throw the error so the
// function crashes so we can maintain our previous cache
// instead of caching the error page
export function handleISRError({ error }: { error: any }) {
  if (workAsyncStorage) {
    const store = workAsyncStorage.getStore()
    if (store?.isStaticGeneration) {
      if (error) {
        console.error(error)
      }
      throw error
    }
  }
}
