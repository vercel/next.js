import Page from '@/components/page'
import StoreProvider from '@/lib/StoreProvider'
import { initializeStore } from '@/lib/store'

export const revalidate = false

// If you build and start the app, the date returned here will have the same
// value for all requests, as this page is generated at build time (SSG).

export default function SSGPage() {
  const zustandStore = initializeStore()

  return (
    <StoreProvider {...zustandStore}>
      <Page />
    </StoreProvider>
  )
}
