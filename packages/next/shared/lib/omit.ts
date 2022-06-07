export function omit<T extends { [key: string]: any }, K extends keyof T>(
  object: T,
  keys: K[]
): Omit<T, K> {
  const omitted: { [key: string]: any } = {}
  Object.keys(object).forEach((key) => {
    if (!keys.includes(key as K)) {
      omitted[key as string] = object[key]
    }
  })
  return omitted as Omit<T, K>
}
