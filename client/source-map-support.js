// @flow
import fetch from 'unfetch'
const filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/

export async function applySourcemaps (e: any): Promise<void> {
  if (!e || typeof e.stack !== 'string' || e.sourceMapsApplied) {
    return
  }

  const lines = e.stack.split('\n')

  const result = await Promise.all(lines.map((line) => {
    return rewriteTraceLine(line)
  }))

  e.stack = result.join('\n')
  // This is to make sure we don't apply the sourcemaps twice on the same object
  e.sourceMapsApplied = true
}

async function rewriteTraceLine (trace: string): Promise<string> {
  const m = trace.match(filenameRE)
  if (m == null) {
    return trace
  }

  const filePath = m[1]
  if (filePath.match(/node_modules/)) {
    return trace
  }

  const mapPath = `${filePath}.map`

  const res = await fetch(mapPath)
  if (res.status !== 200) {
    return trace
  }

  const mapContents = await res.json()
  const {SourceMapConsumer} = require('source-map')
  const map = new SourceMapConsumer(mapContents)
  const originalPosition = map.originalPositionFor({
    line: Number(m[2]),
    column: Number(m[3])
  })

  if (originalPosition.source != null) {
    const { source, line, column } = originalPosition
    const mappedPosition = `(${source.replace(/^webpack:\/\/\//, '')}:${String(line)}:${String(column)})`
    return trace.replace(filenameRE, mappedPosition)
  }

  return trace
}
