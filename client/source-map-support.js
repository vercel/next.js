// @flow
const filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/

export function rewriteStacktrace (e: any, distDir: string): void {
  if (!e || typeof e.stack !== 'string') {
    return
  }

  const lines = e.stack.split('\n')

  const result = lines.map((line) => {
    return rewriteTraceLine(line, distDir)
  })

  e.stack = result.join('\n')
  // This is to make sure we don't apply the sourcemaps twice on the same object
  e.sourceMapsApplied = true
}

function rewriteTraceLine (trace: string, distDir: string): string {
  const m = trace.match(filenameRE)
  if (m == null) {
    return trace
  }
  trace = trace.replace(distDir, '/_next/development')
  return trace
}
