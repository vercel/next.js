import type { ReactTimingRecord } from '../../shared/lib/react-debug-timing'
import { parseStack } from '../../server/lib/parse-stack'

export type ReactDecoderScope = {
  record(timing: Omit<ReactTimingRecord, 'id'>): void
}

let currentScope: ReactDecoderScope | undefined
type DecoderTask = Pick<
  ReactTimingRecord,
  'componentPath' | 'ownerName' | 'source'
>
let currentTask: DecoderTask | undefined

export function runWithReactDecoderScope<T>(
  scope: ReactDecoderScope | undefined,
  callback: () => T
): T {
  const previous = currentScope
  currentScope = scope
  try {
    return callback()
  } finally {
    currentScope = previous
  }
}

function bind<T extends (...args: any[]) => any>(
  scope: ReactDecoderScope | undefined,
  callback: T
): T {
  if (typeof callback !== 'function' || !scope) return callback
  return function (this: unknown, ...args) {
    return runWithReactDecoderScope(scope, () => callback.apply(this, args))
  } as T
}

// This is a lexical binding of the Flight decoder, never window.Promise.
// React also schedules work through Promise.all when a Client Reference blocks
// debug props. Binding stream reads alone loses that continuation's request.
export class DecoderPromise<T> extends Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return super.then(
      onfulfilled && bind(currentScope, onfulfilled),
      onrejected && bind(currentScope, onrejected)
    )
  }
}

export function bindReactDecoderPromise<T>(
  promise: Promise<T>,
  scope = currentScope
): Promise<T> {
  if (!scope) return promise
  return new Proxy(promise, {
    get(target, key) {
      if (key === 'then') {
        return (
          resolve: (value: T) => unknown,
          reject: (error: unknown) => unknown
        ) =>
          bindReactDecoderPromise(
            target.then(bind(scope, resolve), bind(scope, reject)),
            scope
          )
      }
      if (key === 'catch') {
        return (reject: (error: unknown) => unknown) =>
          bindReactDecoderPromise(target.catch(bind(scope, reject)), scope)
      }
      if (key === 'finally') {
        return (callback: () => void) =>
          bindReactDecoderPromise(target.finally(bind(scope, callback)), scope)
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export function bindReactDecoderStream<T>(
  stream: ReadableStream<T>,
  scope: ReactDecoderScope
): ReadableStream<T> {
  // No second reader, tee, buffering, or change to backpressure. Forward the
  // native receiver, including BYOB reader options and cancellation.
  return new Proxy(stream, {
    get(target, key) {
      if (key === 'getReader') {
        return (options?: ReadableStreamGetReaderOptions) => {
          const reader = target.getReader(options)
          return new Proxy(reader, {
            get(readerTarget, readerKey) {
              if (readerKey === 'read') {
                return (...args: unknown[]) =>
                  bindReactDecoderPromise(
                    Reflect.apply(readerTarget.read, readerTarget, args),
                    scope
                  )
              }
              const value = Reflect.get(readerTarget, readerKey, readerTarget)
              return typeof value === 'function'
                ? value.bind(readerTarget)
                : value
            },
          })
        }
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function record(
  name: unknown,
  start: unknown,
  end: unknown,
  group: unknown,
  outcome: ReactTimingRecord['outcome']
) {
  if (
    !currentScope ||
    group !== 'Server Components ⚛' ||
    typeof name !== 'string' ||
    name === 'Server Components Track' ||
    typeof start !== 'number' ||
    typeof end !== 'number'
  ) {
    return
  }

  const awaiting = name.startsWith('await ')
  const component = name.replace(/^\u200b/, '')
  const environment = / \[([^\]]+)\]$/.exec(component)
  const deduped = environment?.[1] === 'deduped'
  const componentName = deduped
    ? component
    : component.replace(/ \[[^\]]+\]$/, '')
  let componentPath = currentTask?.componentPath
  if (!awaiting && componentPath?.endsWith('…')) {
    componentPath = `${componentPath.slice(0, -1)}${componentName}`.slice(
      0,
      2048
    )
  }
  try {
    currentScope.record({
      kind: awaiting ? 'await' : 'component',
      // React's IO labels can contain resolved values and URLs. Do not send
      // these, props, keys, tooltipText, or error details back to the server.
      name: awaiting ? 'async work' : componentName.slice(0, 256),
      environment: deduped
        ? 'Unknown'
        : (environment?.[1].slice(0, 64) ?? 'Server'),
      startTime: performance.timeOrigin + start,
      durationMs: end - start,
      outcome,
      ...currentTask,
      componentPath,
    })
  } catch {
    // Observability must not interrupt the decoder or its console output.
  }
}

type TaskConsole = Console & {
  createTask?: (name: string) => { run<T>(callback: () => T): T }
}

export const decoderConsole = new Proxy(console as TaskConsole, {
  get(target, key) {
    if (key === 'createTask' && typeof target.createTask === 'function') {
      const createTask = target.createTask.bind(target)
      return (name: string) => {
        const scope = currentScope
        const task = createTask(name)
        let metadata: DecoderTask | undefined
        try {
          if (!scope) return task
          const label = name.startsWith('await ')
            ? 'async work'
            : name.replace(/^<|>$/g, '').slice(0, 256)
          const parentPath = currentTask?.componentPath
          // React creates this task inside its reconstructed server call stack.
          // Keep only that callsite, not props or the complete browser stack.
          const reactStack = (new Error().stack ?? '')
            .split('\n')
            .filter((line) => line.includes('about://React/'))
            .join('\n')
          const frame = parseStack(reactStack).find((entry) =>
            entry.file?.startsWith('about://React/')
          )
          const environmentTask = name.startsWith('"use ')
          const parentName = parentPath?.split(' › ').at(-1)
          metadata = {
            // React omits some owner tasks and names environment boundaries
            // instead of their components. Keep those gaps explicit.
            componentPath:
              environmentTask && !frame
                ? parentPath
                : `${parentPath ?? '…'} › ${environmentTask ? '…' : label}`.slice(
                    0,
                    2048
                  ),
            ownerName: parentName === '…' ? undefined : parentName,
          }
          if (frame?.file && frame.line1 && frame.column1) {
            metadata.source = {
              file: frame.file,
              line: frame.line1,
              column: frame.column1,
              methodName: frame.methodName,
            }
          }
        } catch {
          // Source metadata is optional; preserve the native task if it fails.
        }
        return {
          run<T>(callback: () => T): T {
            return task.run(
              bind(scope, () => {
                const previous = currentTask
                currentTask = metadata
                try {
                  return callback()
                } finally {
                  currentTask = previous
                }
              })
            )
          },
        }
      }
    }
    if (key === 'timeStamp' && typeof target.timeStamp === 'function') {
      return (...args: unknown[]) => {
        const result = Reflect.apply(target.timeStamp, target, args)
        const color = args[5]
        record(
          args[0],
          args[1],
          args[2],
          args[4],
          color === 'warning'
            ? 'aborted'
            : color === 'error'
              ? // Slow successful components use the same color as errors.
                typeof args[0] === 'string' && args[0].startsWith('await ')
                ? 'errored'
                : undefined
              : typeof color === 'string'
                ? 'completed'
                : undefined
        )
        return result
      }
    }
    const value = Reflect.get(target, key, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export const decoderPerformance = new Proxy(performance, {
  get(target, key) {
    if (key === 'measure' && typeof target.measure === 'function') {
      return (...args: Parameters<Performance['measure']>) => {
        const entry = target.measure(...args)
        try {
          const detail = entry.detail?.devtools
          // Only inspect React's fixed outcome marker, never its value. Color
          // alone is not an outcome: slow successful renders are also red.
          const marker = detail?.properties?.[0]?.[0]
          const outcome =
            detail?.color === 'warning' && marker === 'Aborted'
              ? 'aborted'
              : detail?.color === 'error' &&
                  (entry.name.startsWith('await ')
                    ? marker === 'Rejected'
                    : marker === 'Error' &&
                      detail.tooltipText ===
                        `${entry.name.replace(/^\u200b/, '')} Errored`)
                ? 'errored'
                : 'completed'
          record(
            entry.name,
            entry.startTime,
            entry.startTime + entry.duration,
            detail?.trackGroup,
            outcome
          )
        } catch {
          // Metadata collection must not change native performance behavior.
        }
        return entry
      }
    }
    const value = Reflect.get(target, key, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export function decoderSetTimeout(
  callback: (...args: any[]) => void,
  delay?: number,
  ...args: any[]
) {
  return setTimeout(bind(currentScope, callback), delay, ...args)
}

export function bindReactDecoderChunkLoader<
  T extends (...args: any[]) => Promise<any>,
>(load: T): T {
  return ((...args) => bindReactDecoderPromise(load(...args))) as T
}
