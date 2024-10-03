import { createSnapshot } from '../../client/components/async-local-storage'

export const runInCleanSnapshot: <R, TArgs extends any[]>(
  fn: (...args: TArgs) => R,
  ...args: TArgs
) => R = createSnapshot()
