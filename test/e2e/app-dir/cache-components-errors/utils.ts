// Used to deterministically stub out minified local names in stack traces.
const abc = 'abcdefghijklmnopqrstuvwxyz'
const hostElementsUsedInFixtures = ['html', 'body', 'main', 'div']
const ignoredLines = [
  'Generating static pages',
  'Inlining static env',
  'Finalizing page optimization',
  // The config evaluation timing line (e.g. "✓ Running next.config.js took
  // 15ms") is non-deterministic boot/build noise that is irrelevant to these
  // runtime-error snapshots.
  'Running next.config',
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
  // With the error-inspect patch disabled (no source maps at runtime), errors
  // intentionally show the raw framework tail of the stack: frames from the
  // compiled Next.js runtime, which we collapse into a single placeholder,
  // and Node.js internals, which we drop since they differ across Node.js
  // versions.
  let isCollapsingFrameworkFrames = false
  let frameAnchor: number | null = null
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
      if (
        !isCollapsingFrameworkFrames &&
        /^\s+at .*node_modules\/next\/dist\//.test(line)
      ) {
        isCollapsingFrameworkFrames = !line.endsWith(' {')
        lines.push('    at <next-internal>' + (line.endsWith(' {') ? ' {' : ''))
        frameAnchor = lines.length - 1
        continue
      }
      if (isCollapsingFrameworkFrames) {
        if (line.startsWith('    at ')) {
          if (line.endsWith(' {')) {
            lines[frameAnchor!] += ' {'
            isCollapsingFrameworkFrames = false
          }
          continue
        }
        isCollapsingFrameworkFrames = false
      }
      if (/^\s+at (?:async )?(?:[\w$.]+ )?\(?node:/.test(line)) {
        // The ` {` that opens the printed error properties is attached to the
        // last frame, so it has to be re-attached to the last kept frame.
        if (line.endsWith(' {') && frameAnchor !== null) {
          lines[frameAnchor] += ' {'
        }
        continue
      }

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
        .replace(/at (.+?) \((.*?\/)?.next[^)]+\)/, replaceNextDistStackFrame)
        .replace(
          // Single-letter lower-case names are likely minified.
          /at [a-z] \((?!(<next-dist-dir>|<anonymous>))/,
          replaceMinifiedName
        )
        .replace(/at \d+ \(/, replaceNumericModuleId)
        .replace(/digest: '\d+(@E\d+)?'/, "digest: '<error-digest>'")

      lines.push(convertModuleFunctionSequenceExpression(line))
      frameAnchor = line.startsWith('    at ') ? lines.length - 1 : null
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
