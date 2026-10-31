export {
  renamedInMiddleLayer as finalExportName,
  middleLayerFunction as finalFunctionName,
  defaultFromA as finalDefaultExport,
  exportsInfo,
} from './b'

export const localInC = 'local-c'

export default function () {
  return 'default-from-c'
}
