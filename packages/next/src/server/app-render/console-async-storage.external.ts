import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { consoleAsyncStorageInstance } from './console-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export interface ConsoleStore {
  /**
   * if true the color of logs output will be dimmed to indicate the log is
   * from a repeat or validation render that is not typically relevant to
   * the primary action the server is taking.
   */
  readonly dim: boolean
}

export type ConsoleAsyncStorage = AsyncLocalStorage<ConsoleStore>

export { consoleAsyncStorageInstance as consoleAsyncStorage }
