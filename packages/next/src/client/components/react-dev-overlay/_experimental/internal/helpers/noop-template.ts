export function noop(
  strings: TemplateStringsArray,
  ...keys: readonly string[]
) {
  const lastIndex = strings.length - 1
  return (
    strings.slice(0, lastIndex).reduce((p, s, i) => p + s + keys[i], '') +
    strings[lastIndex]
  )
}
