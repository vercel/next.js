import type { ImageConfigRuntime } from './image-config'
import { imageConfigDefault } from './image-config'

let imageConfig: ImageConfigRuntime = imageConfigDefault
let registeredConfig: string | undefined
let consumed = false
let conflictingRegistration = false
let warned = false

function warnIfConflicting() {
  if (consumed && conflictingRegistration && !warned) {
    warned = true
    console.warn(
      'Conflicting image options were registered in this process, possibly by multiple Next.js instances. The first options will be used.'
    )
  }
}

/** Register the process-wide image options before loading application code. */
export function registerImageConfig(config: ImageConfigRuntime): void {
  const serializedConfig = JSON.stringify(config)
  if (registeredConfig === undefined) {
    imageConfig = config
    registeredConfig = serializedConfig
  } else if (registeredConfig !== serializedConfig) {
    conflictingRegistration = true
    warnIfConflicting()
  }
}

/** Read at use time so imports before registration do not capture defaults. */
export function getImageConfig(): ImageConfigRuntime {
  consumed = true
  warnIfConflicting()
  return imageConfig
}
