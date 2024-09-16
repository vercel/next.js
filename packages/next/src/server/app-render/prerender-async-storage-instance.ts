import type { PrerenderAsyncStorage } from './prerender-async-storage.external'
import { createAsyncLocalStorage } from '../../client/components/async-local-storage'

export const prerenderAsyncStorage: PrerenderAsyncStorage =
  createAsyncLocalStorage()
