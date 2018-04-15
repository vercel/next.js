// @flow
import fs from 'fs'
import promisify from './promisify'
import {SourceMapConsumer} from 'source-map'

const readFile = promisify(fs.readFile)
const access = promisify(fs.access)
const filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/

export async function rewriteErrorTrace (e: any): Promise<void> {
  if (!e || typeof e.stack !== 'string') {
    return
  }

  const lines = e.stack.split('\n')

  const result = await Promise.all(lines.map((line) => {
    return rewriteTraceLine(line)
  }))

  e.stack = result.join('\n')
}

async function rewriteTraceLine (trace: string): Promise<string> {
  const m = trace.match(filenameRE)
  if (m == null) {
    return trace
  }

  const filePath = m[1]
  const mapPath = `${filePath}.map`

  try {
    await access(mapPath, (fs.constants || fs).R_OK)
  } catch (err) {
    return trace
  }

  const mapContents = await readFile(mapPath)
  const map = new SourceMapConsumer(JSON.parse(mapContents))
  const originalPosition = map.originalPositionFor({
    line: Number(m[2]),
    column: Number(m[3])
  })

  console.log('POSITION', originalPosition)

  if (originalPosition.source != null) {
    const { source, line, column } = originalPosition
    const mappedPosition = `(${source.replace(/^webpack:\/\/\//, '')}:${String(line)}:${String(column)})`
    return trace.replace(filenameRE, mappedPosition)
  }

  return trace
}
