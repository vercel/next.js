import { readX } from './a.js'

try {
  globalThis.seenByReader = readX()
} catch (error) {
  globalThis.seenByReader = error.constructor.name
}

globalThis.evaluationOrder.push('reader')
