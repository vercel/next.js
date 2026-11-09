import { describe, shared as sharedOfBarrel } from './library/barrel.js'
import { shared, loadConfig } from './shared.js'
// Not read: this import only evaluates `config.js`.
import { config } from './config.js'

globalThis.deferEvents.push('three-modules:entry')

const sharedAtEvaluation = shared

export async function run() {
  return {
    shared: [sharedAtEvaluation, sharedOfBarrel],
    described: await describe(),
    locale: await loadConfig(),
  }
}
