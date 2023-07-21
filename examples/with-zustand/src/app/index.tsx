import StoreProvider from '@/lib/StoreProvider'
import Page from '../components/page'
import { initializeStore } from '../lib/store'

export default function Home() {
  const zustandStore = initializeStore()

  return (
    <StoreProvider {...zustandStore}>
      <Page />
    </StoreProvider>
  )
}
