export function omit<T extends { [key: string]: unknown }, K extends keyof T>(
  object: T,
  keys: K[]
): Omit<T, K> {
  const omitted: { [key: string]: unknown } = {}
  Object.keys(object).forEach((key) => {
    if (!keys.includes(key as K)) {
      omitted[key] = object[key]
    }
  })
  return omitted as Omit<T, K>
}
