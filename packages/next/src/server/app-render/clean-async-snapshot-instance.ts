import { createSnapshot } from '../../server/app-render/async-local-storage'

export const runInCleanSnapshot: <R, TArgs extends any[]>(
  fn: (...args: TArgs) => R,
  ...args: TArgs
) => R = createSnapshot()
