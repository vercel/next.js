import type { Channel } from './types'

type EvaluationModule = {
  init?: () => Promise<void>
  default: (channel: Channel<any, any>, ...args: any[]) => any
}

// A worker can serve many emitted entries. Cache their initialization independently, including
// asynchronous exports.
const modules = new Map<string, Promise<EvaluationModule['default']>>()

/** Resolves to the entry's callable default export after its optional async initialization. */
export function loadEvaluation(
  entry: string
): Promise<EvaluationModule['default']> {
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
