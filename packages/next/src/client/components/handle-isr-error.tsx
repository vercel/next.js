import { workAsyncStorage } from './server-async-storage'

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
