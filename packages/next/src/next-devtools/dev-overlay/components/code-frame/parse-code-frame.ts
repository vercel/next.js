import Anser, { type AnserJsonEntry } from 'next/dist/compiled/anser'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import type { StackFrame } from '../../../shared/stack-frame'

// Strip leading spaces out of the code frame
export function formatCodeFrame(codeFrame: string) {
  const lines = codeFrame.split(/\r?\n/g)

  // Find the minimum length of leading spaces after `|` in the code frame
  const miniLeadingSpacesLength = lines
    .map((line) =>
      /^>? +\d+ +\| [ ]+/.exec(stripAnsi(line)) === null
        ? null
        : /^>? +\d+ +\| ( *)/.exec(stripAnsi(line))
    )
    .filter(Boolean)
    .map((v) => v!.pop()!)
    .reduce((c, n) => (isNaN(c) ? n.length : Math.min(c, n.length)), NaN)

  // When the minimum length of leading spaces is greater than 1, remove them
  // from the code frame to help the indentation looks better when there's a lot leading spaces.
  if (miniLeadingSpacesLength > 1) {
    return lines
      .map((line, a) =>
        ~(a = line.indexOf('|'))
          ? line.substring(0, a) +
            line.substring(a).replace(`^\\ {${miniLeadingSpacesLength}}`, '')
          : line
      )
      .join('\n')
  }
  return lines.join('\n')
}

export function groupCodeFrameLines(formattedFrame: string) {
  // Map the decoded lines to a format that can be rendered
  const decoded = Anser.ansiToJson(formattedFrame, {
    json: true,
    use_classes: true,
    remove_empty: true,
  })
  const lines: (typeof decoded)[] = []

  let line: typeof decoded = []
  for (const token of decoded) {
    // If the token is a new line with only line break "\n",
    // break here into a new line.
    // The line could also contain spaces, it's still considered line break if "\n" line has spaces.
    if (typeof token.content === 'string' && token.content.includes('\n')) {
      const segments = token.content.split('\n')
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        if (segment) {
          line.push({
            ...token,
            content: segment,
          })
        }
        if (i < segments.length - 1) {
          lines.push(line)
          line = []
        }
      }
    } else {
      line.push(token)
    }
  }
  if (line.length > 0) {
    lines.push(line)
  }

  return lines
}

export function parseLineNumberFromCodeFrameLine(
  line: AnserJsonEntry[],
  stackFrame: StackFrame
) {
  let lineNumberToken: AnserJsonEntry | undefined
  let line1: string | undefined
  // parse line number from line first 2 tokens
  // e.g. ` > 1 | const foo = 'bar'` => `1`, first token is `1 |`
  // e.g. `  2 | const foo = 'bar'` => `2`. first 2 tokens are ' ' and ' 2 |'
  if (line[0]?.content === '>' || line[0]?.content === ' ') {
    lineNumberToken = line[1]
    line1 = lineNumberToken?.content?.replace('|', '')?.trim()
  }

  // When the line number is possibly undefined, it can be just the non-source code line
  // e.g. the ^ sign can also take a line, we skip rendering line number for it
  return {
    lineNumber: line1,
    isErroredLine: line1 === stackFrame.line1?.toString(),
  }
}
