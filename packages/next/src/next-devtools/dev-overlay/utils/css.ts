export function css(
  strings: TemplateStringsArray,
  ...keys: readonly string[]
): string {
  const lastIndex = strings.length - 1
  const str =
    // Convert template literal into a single line string
    strings.slice(0, lastIndex).reduce((p, s, i) => p + s + keys[i], '') +
    strings[lastIndex]

  return (
    str
      // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove whitespace, tabs, and newlines
      .replace(/\s+/g, ' ')
      // Remove spaces before and after semicolons, and spaces after commas
      .replace(/\s*([:;,{}])\s*/g, '$1')
      // Remove extra semicolons
      .replace(/;+}/g, '}')
      // Trim leading and trailing whitespaces
      .trim()
  )
}
