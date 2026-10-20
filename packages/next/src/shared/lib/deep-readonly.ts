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
 * The type returned by `deepFreezePlainValues`. Like `DeepReadonly`, but
 * functions keep their own types so they stay callable.
 *
 * Class instances cannot be told apart from plain objects at the type level,
 * so their properties are typed as readonly even though they are not frozen
 * (their methods stay callable). That is stricter than their runtime behavior,
 * never looser.
 */
export type DeepReadonlyPlainValues<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonlyPlainValues<T[K]> }
    : T
