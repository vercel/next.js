/**
 * A type that represents a deeply readonly object. This is similar to
 * TypeScript's `Readonly` type, but it recursively applies the `readonly`
 * modifier to all properties of an object and all elements of arrays.
 */
export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends object
    ? {
        readonly [K in keyof T]: DeepReadonly<T[K]>
      }
    : T

/**
 * The type returned by `deepFreezePlainValues`. Functions and classes used as
 * values keep their own types; everything else is deeply readonly. Class
 * instances are typed readonly too even though they are not frozen, because
 * they cannot be told apart from plain objects at the type level; that is
 * stricter than their runtime behavior, never looser.
 */
export type DeepReadonlyPlainValues<T> = T extends
  | ((...args: any[]) => any) // functions
  | (abstract new (...args: any[]) => any) // classes used as values, including abstract ones
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonlyPlainValues<T[K]> }
    : T
