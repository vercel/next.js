import {
  NativePromise,
  nativePromiseResolveFunction,
  nativePromiseAll,
  nativePromiseThen,
  captureContinuationScope,
} from './async-context'
import { getBrowserActionThen } from './browser-action-identity'

const nativeResolve = nativePromiseResolveFunction
const nativeAll = nativePromiseAll
const settled = Reflect.apply(nativeResolve, NativePromise, [])
type CallScope = ReturnType<typeof captureContinuationScope>

function resolveInCallScope(
  input: unknown,
  scope: CallScope
): Promise<unknown> {
  const then = getBrowserActionThen(input)
  if (!then) return Reflect.apply(nativeResolve, NativePromise, [input])
  return new NativePromise((resolve, reject) => {
    // Native resolution schedules one thenable job. Use the captured engine
    // reaction queue even when authored code has replaced queueMicrotask.
    void Reflect.apply(nativePromiseThen, settled, [
      () =>
        scope.run(() => {
          try {
            Reflect.apply(then, input, [resolve, reject])
          } catch (error) {
            reject(error)
          }
        }),
    ])
  })
}

/** Private compiler bridge: member lookup precedes the original arguments. */
export function bindNativePromiseStaticCall(
  receiver: any,
  key: 'all' | 'resolve'
): (...args: unknown[]) => unknown {
  // Ordinary member access preserves primitive boxing and nullish failures.
  const callee = receiver[key]
  return function (...args: unknown[]): unknown {
    if (receiver !== NativePromise) return Reflect.apply(callee, receiver, args)
    const scope = captureContinuationScope()
    if (
      key === 'resolve' &&
      callee === nativeResolve &&
      args.length > 0 &&
      getBrowserActionThen(args[0])
    )
      return resolveInCallScope(args[0], scope)
    if (key === 'all' && callee === nativeAll) {
      // Keep native all's iterator, capability and rejection algorithms. Its
      // private constructor view forwards observable resolver access and calls
      // to the original receiver, and never wraps the authored input value.
      const constructor = new Proxy(NativePromise, {
        construct(target, values) {
          return Reflect.construct(target, values, target)
        },
        get(target, property) {
          const value = Reflect.get(target, property, target)
          if (property !== 'resolve' || typeof value !== 'function')
            return value
          return function (input: unknown) {
            return value === nativeResolve
              ? resolveInCallScope(input, scope)
              : Reflect.apply(value, NativePromise, [input])
          }
        },
      })
      return Reflect.apply(callee, constructor, args)
    }
    return Reflect.apply(callee, receiver, args)
  }
}
