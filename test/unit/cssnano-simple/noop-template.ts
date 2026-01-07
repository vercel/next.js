export default function noop(strings: TemplateStringsArray, ...keys: string[]) {
  const lastIndex = strings.length - 1
  return (
    strings.slice(0, lastIndex).reduce((p, s, i) => p + s + keys[i], '') +
    strings[lastIndex]
  )
}
