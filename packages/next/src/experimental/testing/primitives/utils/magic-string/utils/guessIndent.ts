export function guessIndent(code: string): string | null {
  const lines = code.split('\n')

  const tabbed = lines.filter((line) => /^\t+/.test(line))
  const spaced = lines.filter((line) => /^ {2,}/.test(line))

  if (tabbed.length === 0 && spaced.length === 0) {
    return null
  }

  // More lines tabbed than spaced? Assume tabs, and
  // default to tabs in the case of a tie (or nothing
  // to go on)
  if (tabbed.length >= spaced.length) {
    return '\t'
  }

  // Otherwise, we need to guess the multiple
  const min = spaced.reduce((previous, current) => {
    const numSpaces = /^ +/.exec(current)![0].length
    return Math.min(numSpaces, previous)
  }, Infinity)

  return ' '.repeat(min)
}
