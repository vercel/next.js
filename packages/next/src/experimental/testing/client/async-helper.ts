import { captureContinuationScope, NativePromise } from './async-context'

/** SWC's compiler-selected async helper; its continuation authority is explicit. */
export function _<Args extends unknown[], Result>(
  factory: (...args: Args) => Generator<unknown, Result, unknown>
) {
  return function (this: unknown, ...args: Args): Promise<Result> {
    const scope = captureContinuationScope()
    return new NativePromise<Result>((resolve, reject) => {
      let iterator: Generator<unknown, Result, unknown>
      try {
        iterator = scope.run(() => Reflect.apply(factory, this, args))
      } catch (error) {
        reject(error)
        return
      }
      const step = (method: 'next' | 'throw', value?: unknown): void =>
        scope.run(() => {
          let result: IteratorResult<unknown, Result>
          try {
            result = iterator[method](value)
          } catch (error) {
            reject(error)
            return
          }
          if (result.done) resolve(result.value)
          else
            scope.resume(
              result.value,
              (fulfilledValue: unknown) => step('next', fulfilledValue),
              (error: unknown) => step('throw', error)
            )
        })
      step('next')
    })
  }
}
