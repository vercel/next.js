// Used to deterministically stub out minified local names in stack traces.
const abc = 'abcdefghijklmnopqrstuvwxyz'
const hostElementsUsedInFixtures = ['html', 'body', 'main', 'div']
import escapeStringRegexp from 'escape-string-regexp'

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

  for (const line of cliOutput.split('\n')) {
    if (line.includes('Collecting page data')) {
      foundPrerenderingLine = true
      continue
    }

    if (line.includes('Next.js build worker exited')) {
      break
    }

    if (foundPrerenderingLine && !line.includes('Generating static pages')) {
      lines.push(
        isMinified
          ? line
              .replace(/at \S+ \(.next[^)]+\)/, replaceNextDistStackFrame)
              .replace(/at (\S+) \(<anonymous>\)/, replaceAnonymousStackFrame)
          : line.replace(
              /at (\S+) \((webpack:\/\/)\/src[^)]+\)/,
              `at $1 ($2<next-src>)`
            )
      )
    }
  }

  return lines.join('\n').trim()
}

export function assertLog(
  logs: Array<{ source: string; message: string }>,
  environment: 'Server' | 'Prerender' | 'Cache',
  message: string
) {
  expect(logs.map((l) => l.message)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp(
          `^.*${escapeStringRegexp(message)}.*  \\b${environment}\\b  $`
        )
      ),
    ])
  )
}
