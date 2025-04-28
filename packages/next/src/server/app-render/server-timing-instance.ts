import { createAsyncLocalStorage } from './async-local-storage'
import type { Metrics } from './server-timing.external'

export const serverTimingAsyncStorage = createAsyncLocalStorage<{
  metrics: Metrics
}>()
