import * as forwarded from './forwarded-barrel'

export function readForwardedNamespace() {
  const { veryLongForwardedExportName } = forwarded
  return veryLongForwardedExportName
}
