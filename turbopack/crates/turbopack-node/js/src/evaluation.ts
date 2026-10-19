import type { Channel } from './types'

type EvaluationModule = {
  init?: () => Promise<void>
  default: (channel: Channel<any, any>, ...args: any[]) => any
}

// A worker can serve many emitted entries. Cache their initialization independently, including
// asynchronous exports. A pool restart replaces the worker and its module/runtime caches together.
const modules = new Map<string, Promise<EvaluationModule['default']>>()

export function loadEvaluation(entry: string) {
  let module = modules.get(entry)
  if (!module) {
    module = (async () => {
      const factory = await require(/* turbopackIgnore: true */ entry)
      const evaluation: EvaluationModule = await factory.default()
      if (typeof evaluation.init === 'function') {
        await evaluation.init()
      }
      return evaluation.default
    })()
    modules.set(entry, module)
  }
  return module
}
