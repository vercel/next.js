/**
 * A type that represents a deeply readonly object. This is similar to
 * TypeScript's `Readonly` type, but it recursively applies the `readonly`
 * modifier to all properties of an object and all elements of arrays.
 * String values, including opaque string brands, retain their primitive type.
 */
export type DeepReadonly<T> = T extends string
  ? T
  : T extends (infer R)[]
    ? ReadonlyArray<DeepReadonly<R>>
    : T extends object
      ? {
          readonly [K in keyof T]: DeepReadonly<T[K]>
        }
      : T
