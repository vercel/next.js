// Capture this before Next's node environment installs its server formatter.
// Each file worker owns a fresh process, so this is its actual original Error.
const nodeError = Error
const nodePrepareStackTrace = Object.getOwnPropertyDescriptor(
  nodeError,
  'prepareStackTrace'
)

/** Use Node's enabled source-map support for ordinary Node test Errors. */
export function restoreNodeStackTrace(): void {
  if (nodePrepareStackTrace === undefined) {
    Reflect.deleteProperty(nodeError, 'prepareStackTrace')
  } else {
    Object.defineProperty(nodeError, 'prepareStackTrace', nodePrepareStackTrace)
  }
}
