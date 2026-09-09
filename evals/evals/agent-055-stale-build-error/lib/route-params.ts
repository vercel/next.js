export function defineStaticParams<Key extends string>(
  key: Key,
  values: string[]
) {
  return () => values.map((value) => ({ [key]: value }))
}
