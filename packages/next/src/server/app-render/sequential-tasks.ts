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
  const queue = getOrCreateQueue()
  queue.cancelTask(handle)
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
  let state: 'idle' | 'running' = 'idle'

  type Task = { id: TaskId; callback: () => void }
  const tasks: Task[] = []

  type Action = 'RUN_NEXT_TASK' | 'TRY_STOP'

  function onMessage(event: MessageEvent<Action>) {
    const action = event.data as Action
    switch (action) {
      case 'RUN_NEXT_TASK': {
        const task = tasks.shift()

        // We may receive more 'RUN_NEXT_TASK' messages than we have tasks if a task is cancelled.
        // In that case, we should already be closed, but do it again just in case.
        if (!task) {
          stop()
          return
        }

        state = 'running'
        const { callback } = task
        try {
          callback()
        } catch (err) {
          // Thrown errors will interrupt the message processing loop.
          // Rethrow then in a microtask instead
          queueMicrotask(() => {
            throw err
          })
        } finally {
          if (tasks.length === 0) {
            // We have emptied the queue, but we still
            // need to wait for nextTicks and microtasks to run
            // in case they schedule more tasks.
            dispatchMessage('TRY_STOP')
          }
        }
        return
      }
      case 'TRY_STOP': {
        if (tasks.length === 0) {
          // We got a 'TRY_STOP' message, and no other tasks are scheduled.
          // We have no more work to do for now.
          stop()
        } else {
          // we scheduled a stop, but new tasks were queued before we got here.
          // let the loop execute the queued tasks.
        }
        return
      }
      default: {
        action satisfies never
      }
    }
  }

  function dispatchMessage(action: Action) {
    startListeningForMessages()
    sendPort.postMessage(action)
  }

  let isListening = false
  function startListeningForMessages() {
    if (!isListening) {
      receivePort.addEventListener('message', onMessage)
      isListening = true
    }
  }

  function stopListeningForMessages() {
    if (isListening) {
      receivePort.removeEventListener('message', onMessage)
      isListening = false
    }
  }

  function stop() {
    state = 'idle'
    // We need to stop listening for messages after running queued tasks.
    // otherwise, the message channel will prevent the process from exiting.
    stopListeningForMessages()
  }

  return {
    scheduleTask(callback: () => void): TaskHandle {
      const id = nextTaskId++ as TaskId
      tasks.push({
        id,
        // NOTE: we need to preserve async context for the callback.
        callback: bindSnapshot(callback),
      })

      // Each message is processed in a separate task.
      // We'll pick the callback up from the queue and run it.
      dispatchMessage('RUN_NEXT_TASK')

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
      // Note that we have no way of cancelling the 'RUN_NEXT_TASK' message we queued,
      // so the loop needs to handle receiving more messages than it has tasks.

      if (tasks.length === 0 && state === 'idle') {
        // if this was the last task, and we aren't executing, nothing else will clean us up.
        stop()
      }
    },
  }
}
