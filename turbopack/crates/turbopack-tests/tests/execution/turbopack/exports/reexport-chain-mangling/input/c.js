// Re-export with yet another name
export { renamedInMiddleLayer as finalExportName } from './b'
export { middleLayerFunction as finalFunctionName } from './b'
// Re-export the renamed default again
export { renamedDefaultFromA as finalDefaultExport } from './b'

// Also add a local export
export const localInC = 'local-c'

// Also add a local default export
export default function defaultFromC() {
  return 'default-from-c'
}
