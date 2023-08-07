import type { PlopTypes } from '@turbo/gen'

export function toFileName(str: string) {
  return str.toLowerCase().replace(/ /g, '-')
}

export function init(plop: PlopTypes.NodePlopAPI): void {
  plop.setHelper('toFileName', toFileName)
}
