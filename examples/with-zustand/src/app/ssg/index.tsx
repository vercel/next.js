import Page from '@/components/page'
import { initializeStore } from '../../lib/store'
import StoreProvider from '@/lib/StoreProvider'

export const revalidate = 0

export default function StaticGeneratedPage() {
  // The date returned here will be different for every request that hits the page,
  // that is because the page revalidates at each request the server-side variables

  const zustandStore = initializeStore()

  return (
    <StoreProvider {...zustandStore}>
      <Page />
    </StoreProvider>
  )
}
