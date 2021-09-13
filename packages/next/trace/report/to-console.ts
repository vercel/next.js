import * as Log from '../../build/output/log'
const idToName = new Map<string, string>()

const reportToConsole = (
  spanName: string,
  duration: number,
  _timestamp: number,
  id: string,
  parentId?: string,
  attrs?: Object
) => {
  idToName.set(id, spanName)

  const parentStr =
    parentId && idToName.has(parentId)
      ? `, parent: ${idToName.get(parentId)}`
      : ''
  const attrsStr = attrs
    ? `, ${Object.entries(attrs)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', ')}`
    : ''

  Log.trace(
    `${spanName} took ${Number(duration) / 1000} ms${parentStr}${attrsStr}`
  )
}

export default {
  flushAll: () => {},
  report: reportToConsole,
}
