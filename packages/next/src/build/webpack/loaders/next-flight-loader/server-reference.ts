/* eslint-disable import/no-extraneous-dependencies */
import { registerServerReference } from 'react-server-dom-webpack/server'

export { registerServerReference }

const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference')

interface ServerReferenceMetadata {
  $$typeof?: symbol
  $$id?: string
  $$bound?: unknown[] | null
  $$location?: Error
}

interface ServerReferenceFunction extends ServerReferenceMetadata {
  (...args: unknown[]): unknown
  bind: typeof lazyBind
  toString: () => string
}

function lazyBind(
  this: ServerReferenceFunction,
  thisArg: unknown,
  ...extraArgs: unknown[]
): ServerReferenceFunction {
  const newFn: ServerReferenceFunction = Function.prototype.bind.call(
    this,
    thisArg,
    ...extraArgs
  )

  if (this.$$typeof === SERVER_REFERENCE_TAG) {
    if (process.env.NODE_ENV !== 'production' && thisArg != null) {
      console.error(
        'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
      )
    }

    const parent = this
    const properties: PropertyDescriptorMap = {
      $$typeof: { value: SERVER_REFERENCE_TAG },
      $$id: { value: parent.$$id, configurable: true },
      $$bound: {
        get() {
          const prev = parent.$$bound
          return prev ? prev.concat(extraArgs) : extraArgs
        },
        configurable: true,
      },
      bind: { value: lazyBind, configurable: true },
    }

    if (process.env.NODE_ENV !== 'production') {
      properties.$$location = { value: parent.$$location, configurable: true }
    }

    return Object.defineProperties(newFn, properties)
  }

  return newFn
}

export function bindServerReference<TArgs extends unknown[], TReturn>(
  target: ((boundArg: Promise<string>, ...args: TArgs) => TReturn) &
    ServerReferenceMetadata,
  getBoundArg: () => Promise<string>
): (...args: TArgs) => TReturn {
  const baseBound = target.$$bound

  function boundWrapper(this: unknown, ...args: TArgs): TReturn {
    return target.call(this, getBoundArg(), ...args)
  }

  Object.defineProperty(boundWrapper, 'name', {
    value: target.name,
    configurable: true,
  })

  const properties: PropertyDescriptorMap = {
    $$typeof: { value: target.$$typeof },
    $$id: { value: target.$$id, configurable: true },
    $$bound: {
      get() {
        const boundArg = getBoundArg()
        return baseBound ? baseBound.concat([boundArg]) : [boundArg]
      },
      configurable: true,
    },
    bind: { value: lazyBind, configurable: true },
    toString: {
      value: target.toString,
      configurable: true,
      writable: true,
    },
  }

  if (process.env.NODE_ENV !== 'production') {
    properties.$$location = { value: target.$$location, configurable: true }
  }

  return Object.defineProperties(boundWrapper, properties)
}
