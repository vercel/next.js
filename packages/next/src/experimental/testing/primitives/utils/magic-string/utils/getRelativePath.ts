export function getRelativePath(from: string, to: string): string {
  const fromParts = from.split(/[/\\]/)
  const toParts = to.split(/[/\\]/)

  fromParts.pop() // get dirname

  while (fromParts[0] === toParts[0]) {
    fromParts.shift()
    toParts.shift()
  }

  if (fromParts.length) {
    let i = fromParts.length
    while (i--) fromParts[i] = '..'
  }

  return fromParts.concat(toParts).join('/')
}
