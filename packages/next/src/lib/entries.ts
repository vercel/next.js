type Entries<T> = {
  [K in keyof T]: [K, T[K]]
}[keyof T][]

export function typedEntries<
  T extends { [s: string]: unknown } | ArrayLike<unknown>,
>(value: T): Entries<T> {
  return Object.entries(value) as Entries<T>
}
