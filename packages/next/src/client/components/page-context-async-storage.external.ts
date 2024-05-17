import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { pageContextAsyncStorage } from './page-context-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export type PageStore = { [key: string]: unknown }

export type PageContextAsyncStorage = AsyncLocalStorage<PageStore>

export { pageContextAsyncStorage }
