export function formatVariant(
  scenario: string,
  props: Record<string, string | number | boolean | null>
): string {
  const propsStr = formatVariantProps(props)
  return propsStr ? `${scenario} ${propsStr}` : scenario
}

// Just the props part (no scenario prefix). Stable key for snapshots/compare.
export function formatVariantProps(
  props: Record<string, string | number | boolean | null>
): string {
  return Object.keys(props)
    .filter((key) => props[key] !== false && props[key] !== null)
    .map((key) => (props[key] === true ? key : `${key}=${props[key]}`))
    .join(' ')
}
