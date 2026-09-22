import * as namespacePath from './multi-hop-2'
import { veryLongMultiHopExportName as namedPath } from './multi-hop-source'

export { multiHopExportsInfo } from './multi-hop-source'

export function readMultiHopDiamond() {
  const { veryLongMultiHopExportName } = namespacePath
  return [veryLongMultiHopExportName, namedPath]
}
