// Used to deterministically stub out minified local names in stack traces.
const abc = 'abcdefghijklmnopqrstuvwxyz'
const hostElementsUsedInFixtures = ['html', 'body', 'main', 'div']
const ignoredLines = [
  'Generating static pages',
  'Inlining static env',
  'Finalizing page optimization',
]

/**
 * Converts a module function sequence expression, e.g.:
 * - (0 , __TURBOPACK__imported__module__1836__.cookies)(...)
 * - (0 , c.cookies)(...)
 * - (0 , cookies.U)(...)
 * - (0 , e.U)(...)
 * to a deterministic, bundler-agnostic representation.
 */
export function convertModuleFunctionSequenceExpression(
  output: string
): string {
  return output.replace(/\(0 , \w+\.(\w+)\)\(\.\.\.\)/, '<module-function>()')
}

export function getDeterministicOutput(
  cliOutput: string,
  {
    isMinified,
    startingLineMatch,
  }: { isMinified: boolean; startingLineMatch?: string }
): string {
  const lines: string[] = []

  // If no starting line match is provided, we start from the beginning.
  let foundStartingLine = !startingLineMatch
  let a = 0
  let n = 0

  const replaceNextDistStackFrame = (_m: string, name: string) =>
    `at ${isMinified ? abc[a++ % abc.length] : name} (<next-dist-dir>)`

  const isLikelyLibraryInternalStackFrame = (line: string) => {
    return line.startsWith('    at InnerLayoutRouter (')
  }

  const replaceAnonymousStackFrame = (_m: string, name: string) => {
    const deterministicName = hostElementsUsedInFixtures.includes(name)
      ? name
      : abc[a++ % abc.length]

    return `at ${deterministicName} (<anonymous>)`
  }

  const replaceMinifiedName = () => `at ${abc[a++ % abc.length]} (`
  const replaceNumericModuleId = () => `at ${n++} (`

  let isErrorWithStackTraceStartingInLibraryInternals = false
  for (let line of cliOutput.split('\n')) {
    if (
      !isErrorWithStackTraceStartingInLibraryInternals &&
      isLikelyLibraryInternalStackFrame(line)
    ) {
      isErrorWithStackTraceStartingInLibraryInternals = true
      lines.push('    at <FIXME-library-internal>')
      continue
    }
    if (isErrorWithStackTraceStartingInLibraryInternals) {
      if (
        // stackframe
        line.startsWith('    at ') ||
        // codeframe
        /^ {2}\d+ \|/.test(line) ||
        // codeframe cursor for callsite
        /^> \d+ \|/.test(line) ||
        /^\s+\|/.test(line)
      ) {
        // still an error with a stack trace starting in library internals
        continue
      } else {
        isErrorWithStackTraceStartingInLibraryInternals = false
      }
    }
    if (startingLineMatch && line.includes(startingLineMatch)) {
      foundStartingLine = true
      continue
    }

    if (line.includes('Next.js build worker exited')) {
      break
    }

    if (line.includes('Route (app)')) {
      break
    }

    if (
      foundStartingLine &&
      !ignoredLines.some((ignoredLine) => line.includes(ignoredLine))
    ) {
      if (isMinified) {
        line = line.replace(
          /at (\S+) \(<anonymous>\)/,
          replaceAnonymousStackFrame
        )
      } else {
        line = line.replace(
          /at (\S+) \((webpack:\/\/\/)src[^)]+\)/,
          `at $1 ($2<next-src>)`
        )
      }

      line = line
        .replace(/at (.+?) \(.next[^)]+\)/, replaceNextDistStackFrame)
        .replace(
          // Single-letter lower-case names are likely minified.
          /at [a-z] \((?!(<next-dist-dir>|<anonymous>))/,
          replaceMinifiedName
        )
        .replace(/at \d+ \(/, replaceNumericModuleId)
        .replace(/digest: '\d+(@E\d+)?'/, "digest: '<error-digest>'")

      lines.push(convertModuleFunctionSequenceExpression(line))
    }
  }

  return lines.join('\n').trim()
}

export function getPrerenderOutput(
  cliOutput: string,
  { isMinified }: { isMinified: boolean }
): string {
  return getDeterministicOutput(cliOutput, {
    isMinified,
    startingLineMatch: 'Collecting page data',
  })
}
