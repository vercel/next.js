import type { TurbopackMessageAction } from '../../../../server/dev/hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../../../build/swc/types'

interface HmrUpdate {
  updatedModules: Set<string>
  startMsSinceEpoch: number
  endMsSinceEpoch: number
}

export class TurbopackHmr {
  #updatedModules: Set<string>
  #startMsSinceEpoch: number | undefined
  #lastUpdateMsSinceEpoch: number | undefined

  constructor() {
    this.#updatedModules = new Set()
  }

  onBuilding() {
    this.#lastUpdateMsSinceEpoch = undefined
    this.#startMsSinceEpoch = Date.now()
  }

  onTurbopackMessage(msg: TurbopackMessageAction) {
    this.#lastUpdateMsSinceEpoch = Date.now()
    const updatedModules = extractModulesFromTurbopackMessage(msg.data)
    for (const module of updatedModules) {
      this.#updatedModules.add(module)
    }
  }

  onBuilt(): HmrUpdate | null {
    // it's possible for `this.#startMsSinceEpoch` to not be set if this was the initial
    // computation, just return null in this case.
    if (this.#startMsSinceEpoch == null) {
      return null
    }
    const result = {
      updatedModules: this.#updatedModules,
      startMsSinceEpoch: this.#startMsSinceEpoch!,
      // Turbopack has a debounce which causes every BUILT message to appear
      // 30ms late. We don't want to include this latency in our reporting, so
      // prefer to use the last TURBOPACK_MESSAGE time.
      endMsSinceEpoch: this.#lastUpdateMsSinceEpoch ?? Date.now(),
    }
    this.#updatedModules = new Set()
    return result
  }
}

function extractModulesFromTurbopackMessage(
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
