import { actionAsyncStorage } from './app-render/action-async-storage.external'
import { afterTaskAsyncStorage } from './app-render/after-task-async-storage.external'
import { consoleAsyncStorage } from './app-render/console-async-storage.external'
import { dynamicAccessAsyncStorage } from './app-render/dynamic-access-async-storage.external'
import { workAsyncStorage } from './app-render/work-async-storage.external'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
import { getTracer } from './lib/trace/tracer'

/**
 * WebSocket hooks can outlive the request which accepted the connection. Exit
 * every request-scoped store and both tracing implementations so user work
 * cannot retain or be attributed to the completed handshake.
 */
export function runInWebSocketHookContext<T>(fn: () => T): T {
  return workAsyncStorage.exit(() =>
    workUnitAsyncStorage.exit(() =>
      actionAsyncStorage.exit(() =>
        afterTaskAsyncStorage.exit(() =>
          dynamicAccessAsyncStorage.exit(() =>
            consoleAsyncStorage.exit(() =>
              getTracer().runWithDetachedContext(fn)
            )
          )
        )
      )
    )
  )
}
