// Used to deterministically stub out minified local names in stack traces.
const abc = 'abcdefghijklmnopqrstuvwxyz'
const hostElementsUsedInFixtures = ['html', 'body', 'main', 'div']
const ignoredLines = ['Generating static pages', 'Inlining static env']

export function getPrerenderOutput(
  cliOutput: string,
  { isMinified }: { isMinified: boolean }
): string {
  const lines: string[] = []
  let foundPrerenderingLine = false
  let i = 0

  const replaceNextDistStackFrame = () =>
    `at ${abc[i++ % abc.length]} (<next-dist-dir>)`

  const replaceAnonymousStackFrame = (_m, name) => {
    const deterministicName = hostElementsUsedInFixtures.includes(name)
      ? name
      : abc[i++ % abc.length]

    return `at ${deterministicName} (<anonymous>)`
  }

  for (let line of cliOutput.split('\n')) {
    if (line.includes('Collecting page data')) {
      foundPrerenderingLine = true
      continue
    }

    if (line.includes('Next.js build worker exited')) {
      break
    }

    if (
      foundPrerenderingLine &&
      !ignoredLines.some((ignoredLine) => line.includes(ignoredLine))
    ) {
      if (isMinified) {
        line = line
          .replace(/at \S+ \(.next[^)]+\)/, replaceNextDistStackFrame)
          .replace(/at (\S+) \(<anonymous>\)/, replaceAnonymousStackFrame)
      } else {
        line = line.replace(
          /at (\S+) \((webpack:\/\/)\/src[^)]+\)/,
          `at $1 ($2<next-src>)`
        )
      }

      line = line
        .replace(/digest: '\d+'/, "digest: '<error-digest>'")
        // Convert a module function sequence expression, e.g.:
        // - (0 , __TURBOPACK__imported__module__1836__.cookies)(...)
        // - (0 , c.cookies)(...)
        // - (0 , cookies.U)(...)
        // - (0 , e.U)(...)
        .replace(/\(0 , \w+\.(\w+)\)\(\.\.\.\)/, '<module-function>()')

      lines.push(line)
    }
  }

  return lines.join('\n').trim()
}
