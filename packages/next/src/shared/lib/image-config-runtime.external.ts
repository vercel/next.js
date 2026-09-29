import type { ImageConfigRuntime, PreparedImageConfig } from './image-config'
import { imageConfigDefault, prepareImageConfig } from './image-config'

let imageConfig: PreparedImageConfig<ImageConfigRuntime> =
  prepareImageConfig(imageConfigDefault)
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
    imageConfig = prepareImageConfig(config)
    registeredConfig = serializedConfig
  } else if (registeredConfig !== serializedConfig) {
    conflictingRegistration = true
    warnIfConflicting()
  }
}

/** Read at use time so imports before registration do not capture defaults. */
export function getImageConfig(): PreparedImageConfig<ImageConfigRuntime> {
  consumed = true
  warnIfConflicting()
  return imageConfig
}
