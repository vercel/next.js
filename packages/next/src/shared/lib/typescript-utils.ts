/**
 * Turns optional fields into fields that are required but accept undefined, i.e.
 * `NonPartial<{ x?: number }>` is `{ x: number | undefined }`.
 * Source: https://github.com/microsoft/TypeScript/issues/31025#issuecomment-870011852
 * */
export type NonPartial<T> = { [K in keyof Required<T>]: T[K] }
