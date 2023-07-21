import Page from '@/components/page'
import StoreProvider from '@/lib/StoreProvider'
import { initializeStore } from '@/lib/store'

export const revalidate = 0

// The date returned will be different for every request that hits the page,
// that is because the page runs server-side code at each request.

export default function SSGPage() {
  const zustandStore = initializeStore()

  return (
    <StoreProvider {...zustandStore}>
      <Page />
    </StoreProvider>
  )
}
