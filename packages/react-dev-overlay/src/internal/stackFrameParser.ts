import { StackFrame } from './StackFrame'

const regexExtractLocation = /\(?(.+?)(?::(\d+))?(?::(\d+))?\)?$/

function getLocation(
  token: string
): {
  fileName?: string
  lineNumber?: number
  columnNumber?: number
} {
  const data = regexExtractLocation.exec(token)
  if (!data) {
    return {}
  }

  return {
    fileName: data[1],
    lineNumber: Number(data[2]),
    columnNumber: Number(data[3]),
  }
}

const regexValidFrame_Chrome = /^\s*(at|in)\s.+(:\d+)/
const regexValidFrame_FireFox = /(^|@)\S+:\d+|.+line\s+\d+\s+>\s+(eval|Function).+/

// TODO: more robust parser for correctness
export function parseStack(error: Error): StackFrame[] {
  const stack = error.stack.split('\n')
  const frames = stack
    .filter(
      e => regexValidFrame_Chrome.test(e) || regexValidFrame_FireFox.test(e)
    )
    .map(e => {
      if (regexValidFrame_FireFox.test(e)) {
        // Strip eval, we don't care about it
        let isEval = false
        if (/ > (eval|Function)/.test(e)) {
          e = e.replace(
            / line (\d+)(?: > eval line \d+)* > (eval|Function):\d+:\d+/g,
            ':$1'
          )
          isEval = true
        }
        const data = e.split(/[@]/g)
        const last = data.pop()

        const loc = getLocation(last)
        return new StackFrame(
          data.join('@') || (isEval ? 'eval' : null),
          loc.fileName,
          loc.lineNumber,
          loc.columnNumber
        )
      } else {
        // Strip eval, we don't care about it
        if (e.indexOf('(eval ') !== -1) {
          e = e.replace(/(\(eval at [^()]*)|(\),.*$)/g, '')
        }
        if (e.indexOf('(at ') !== -1) {
          e = e.replace(/\(at /, '(')
        }
        const data = e
          .trim()
          .split(/\s+/g)
          .slice(1)
        const last = data.pop()
        const loc = getLocation(last)
        return new StackFrame(
          data.join(' ') || null,
          loc.fileName,
          loc.lineNumber,
          loc.columnNumber
        )
      }
    })
  return frames
}
