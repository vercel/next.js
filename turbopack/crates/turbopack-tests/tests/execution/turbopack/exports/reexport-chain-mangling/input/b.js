// Re-export with different name
export { veryLongOriginalExportName as renamedInMiddleLayer } from './a'
export { anotherLongFunctionName as middleLayerFunction } from './a'
// Re-export default with a new name
export { default as renamedDefaultFromA } from './a'
