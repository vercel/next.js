export function mergeClassNames(
  ...classNames: (string | undefined | null | false)[]
): string {
  return classNames.filter(Boolean).join(' ')
}

export { mergeClassNames as cn }
