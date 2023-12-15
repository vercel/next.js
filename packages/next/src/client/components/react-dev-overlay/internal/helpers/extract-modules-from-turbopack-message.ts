import type { Update as TurbopackUpdate } from '../../../../../build/swc'

export function extractModulesFromTurbopackMessage(
  data: TurbopackUpdate | TurbopackUpdate[]
) {
  const updates = Array.isArray(data) ? data : [data]
  const updatedModules: Set<string> = new Set()
  for (const update of updates) {
    if (
      update.type !== 'partial' ||
      update.instruction.type !== 'ChunkListUpdate'
    ) {
      continue
    }

    for (const mergedUpdate of update.instruction.merged) {
      for (const name of Object.keys(mergedUpdate.entries)) {
        const res = /(.*)\s+\[.*/.exec(name)
        if (res === null) {
          throw new Error('Expected module to match pattern')
        }
        updatedModules.add(res[1])
      }
    }
  }

  return updatedModules
}
