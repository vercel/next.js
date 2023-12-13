import type { Paths } from './types'
import { READS, CHECKS } from './constants'

const FS_BINDING: any = (process as any).binding('fs')
const FS_MOCKS: Record<keyof Paths, Array<string>> = {
  read: READS,
  checked: CHECKS,
}

export function fsProxy(paths: Paths): () => void {
  if (FS_BINDING._mockedBinding !== undefined) {
    throw new Error('Reentrant tracking')
  }
  const originals: { [key: string]: Function } = {}
  for (const [bucket, fns] of Object.entries(FS_MOCKS) as [
    keyof Paths,
    Array<string>
  ][]) {
    for (const key of fns) {
      const existing = FS_BINDING[key]
      if (typeof existing === 'function') {
        originals[key] = existing
        FS_BINDING[key] = function (this: any) {
          paths[bucket].add(arguments[0])
          return existing.apply(this, arguments)
        }
      }
    }
  }
  return () => {
    for (const [key, original] of Object.entries(originals)) {
      FS_BINDING[key] = original
    }
  }
}
