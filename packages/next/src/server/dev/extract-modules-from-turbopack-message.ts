import type { Update as TurbopackUpdate } from '../../build/swc/types'

export function extractModulesFromTurbopackMessage(
  data: TurbopackUpdate | TurbopackUpdate[]
): Set<string> {
  const updatedModules: Set<string> = new Set()

  const updates = Array.isArray(data) ? data : [data]
  for (const update of updates) {
    // TODO this won't capture changes to CSS since they don't result in a "merged" update
    if (
      update.type !== 'partial' ||
      update.instruction.type !== 'ChunkListUpdate' ||
      update.instruction.merged === undefined
    ) {
      continue
    }

    for (const mergedUpdate of update.instruction.merged) {
      for (const name of Object.keys(mergedUpdate.entries)) {
        const res = /(.*)\s+\[.*/.exec(name)
        if (res === null) {
          console.error(
            '[Turbopack HMR] Expected module to match pattern: ' + name
          )
          continue
        }

        updatedModules.add(res[1])
      }
    }
  }

  return updatedModules
}
