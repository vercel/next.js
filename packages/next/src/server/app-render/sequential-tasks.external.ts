import { InvariantError } from '../../shared/lib/invariant-error'
import { bindSnapshot } from '../app-render/async-local-storage'

let lazyQueue: TaskQueue | null = null
function getOrCreateQueue() {
  if (!lazyQueue) {
    lazyQueue = createTaskQueue()
  }
  return lazyQueue
}

export function scheduleTask(callback: () => void): TaskHandle {
  const queue = getOrCreateQueue()
  return queue.scheduleTask(callback)
}

export function cancelTask(handle: TaskHandle): void {
  if (!lazyQueue) {
    return
  }
  lazyQueue.cancelTask(handle)
}

export function expectNoPendingTasks() {
  if (!lazyQueue) {
    return
  }
  if (lazyQueue.tasks.length > 0) {
    throw new InvariantError(`Expected all tasks to have been executed`)
  }
}

type TaskId = number & { __tag: 'TaskId' }

// We use numbers for task IDs, so it's possible to accidentally try cancelling a task
// with `clearTimeout` (which accepts plain numbers). To prevent this, widen the type
// so that `clearTimeout` doesn't accept it.
export type TaskHandle = TaskId | { NOT_A_TIMER: never }

type TaskQueue = ReturnType<typeof createTaskQueue>

function createTaskQueue() {
  const { port1: receivePort, port2: sendPort } = new MessageChannel()

  let nextTaskId = 0

  type Task = { id: TaskId; callback: () => void }
  const tasks: Task[] = []

  receivePort.addEventListener('message', function runNextTaskOnMessage() {
    const task = tasks.shift()

    // We may receive more messages than we have tasks if a task is cancelled.
    // In that case, we should already be closed, but do it again just in case.
    if (!task) {
      return
    }

    const { callback } = task
    try {
      callback()
    } catch (err) {
      // Thrown errors will interrupt the message processing loop.
      // Rethrow then in a microtask instead
      queueMicrotask(() => {
        throw err
      })
    }
  })

  // In Node, we need to `unref()` the MessagePort, because a ref'd MessagePort
  // with listeners attached will prevent the process from shutting down.
  // Note that this means that if the only work remaining work is a task queued with `scheduleTask`,
  // the process would shut down (unlike e.g `setTimeout`), so a general-purpose scheduler
  // should keep the port ref'd while tasks are queued to avoid this. But in our case this doesn't matter.
  tryUnref(receivePort)

  return {
    tasks,
    scheduleTask(callback: () => void): TaskHandle {
      const id = nextTaskId++ as TaskId
      tasks.push({
        id,
        // NOTE: we need to preserve async context for the callback.
        callback: bindSnapshot(callback),
      })

      // Each message is processed in a separate task.
      // When the message is received, we'll pick the callback up from the queue and run it.
      sendPort.postMessage(null)

      return id as TaskHandle
    },

    cancelTask(handle: TaskHandle): void {
      if (tasks.length === 0) {
        return
      }
      const id = handle as TaskId

      const index = tasks.findIndex((task) => task.id === id)
      if (index !== -1) {
        tasks.splice(index, 1)
      }
      // Note that we have no way of cancelling the message we queued,
      // so the loop needs to handle receiving more messages than it has queued tasks.
    },
  }
}

function tryUnref(port: MessagePort | import('worker_threads').MessagePort) {
  if ('unref' in port && typeof port.unref === 'function') {
    port.unref()
  }
}
