export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const newObj = {} as Pick<T, K>
  for (const key of keys) {
    newObj[key] = obj[key]
  }
  return newObj
}
