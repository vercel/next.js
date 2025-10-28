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

export function getPrerenderOutput(
  cliOutput: string,
  { isMinified }: { isMinified: boolean }
): string {
  const lines: string[] = []
  let foundPrerenderingLine = false
  let a = 0
  let n = 0

  const replaceNextDistStackFrame = () =>
    `at ${abc[a++ % abc.length]} (<next-dist-dir>)`

  const replaceAnonymousStackFrame = (_m, name) => {
    const deterministicName = hostElementsUsedInFixtures.includes(name)
      ? name
      : abc[a++ % abc.length]

    return `at ${deterministicName} (<anonymous>)`
  }

  const replaceMinifiedName = () => `at ${abc[a++ % abc.length]} (`
  const replaceNumericModuleId = () => `at ${n++} (`

  for (let line of cliOutput.split('\n')) {
    if (line.includes('Collecting page data')) {
      foundPrerenderingLine = true
      continue
    }

    if (line.includes('Next.js build worker exited')) {
      break
    }

    if (line.includes('Route (app)')) {
      break
    }

    if (
      foundPrerenderingLine &&
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
        .replace(/at .+? \(.next[^)]+\)/, replaceNextDistStackFrame)
        .replace(
          // Single-letter lower-case names are likely minified.
          /at [a-z] \((?!(<next-dist-dir>|<anonymous>))/,
          replaceMinifiedName
        )
        .replace(/at \d+ \(/, replaceNumericModuleId)
        .replace(/digest: '\d+'/, "digest: '<error-digest>'")
        // TODO(veil): Bundler protocols should not appear in stack frames.
        .replace('webpack:///', 'bundler:///')
        .replace('turbopack:///[project]/', 'bundler:///')

      lines.push(convertModuleFunctionSequenceExpression(line))
    }
  }

  return lines.join('\n').trim()
}
