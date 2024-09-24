import type { NodePlopAPI } from 'node-plop'

export function toFileName(str: string) {
  return str.toLowerCase().replace(/ /g, '-')
}

export function init(plop: NodePlopAPI): void {
  plop.setHelper('toFileName', toFileName)
}
