import { threadId as workerId, workerData } from 'worker_threads'
import { structuredError } from '../error'
import { loadEvaluation } from '../evaluation'
import { Binding, TaskChannel, TEXT_ENCODER, TEXT_DECODER } from './taskChannel'

if (!workerData.hasOwnProperty('bindingPath')) {
  throw new Error('bindingPath not set in loader worker thread')
}

const binding: Binding = require(
  /* turbopackIgnore: true */ workerData.bindingPath
)

binding.workerCreated(workerId)

export const run = async () => {
  let isRunning = false
  const queue: Array<{ taskId: number; entry: string; args: string[] }> = []

  const run = async (taskId: number, entry: string, args: string[]) => {
    try {
      const getValue = await loadEvaluation(entry)
      const value = await getValue(new TaskChannel(binding, taskId), ...args)
      await binding.sendTaskMessage({
        taskId,
        data: TEXT_ENCODER.encode(
          JSON.stringify({
            type: 'end',
            data: value === undefined ? undefined : JSON.stringify(value),
            duration: 0,
          })
        ),
      })
    } catch (err) {
      await binding.sendTaskMessage({
        taskId,
        data: TEXT_ENCODER.encode(
          JSON.stringify({
            type: 'error',
            ...structuredError(err as Error),
          })
        ),
      })
    }
    if (queue.length > 0) {
      const next = queue.shift()!
      run(next.taskId, next.entry, next.args)
    } else {
      isRunning = false
    }
  }

  while (true) {
    const { taskId, data: msg_data } =
      await binding.recvTaskMessageInWorker(workerId)

    const msg_str = TEXT_DECODER.decode(msg_data)
    const msg = JSON.parse(msg_str) as
      | {
          type: 'evaluate'
          entry: string
          args: string[]
        }
      | {
          type: 'result'
          id: number
          error?: string
          data?: any
        }

    switch (msg.type) {
      case 'evaluate': {
        if (!isRunning) {
          isRunning = true
          run(taskId, msg.entry, msg.args)
        } else {
          queue.push({ taskId, entry: msg.entry, args: msg.args })
        }
        break
      }
      case 'result': {
        const request = TaskChannel.requests.get(msg.id)
        if (request) {
          TaskChannel.requests.delete(msg.id)
          if (msg.error) {
            // Need to reject at next macro task queue, because some rejection callbacks is not registered when executing to here,
            // that will cause the error be propergated to schedule thread, then causing panic.
            // The situation always happen when using sass-loader, it will try to resolve many posible dependencies,
            // some of them may fail with error.
            setTimeout(() => request.reject(new Error(msg.error)), 0)
          } else {
            request.resolve(msg.data)
          }
        }
        break
      }
      default: {
        console.error('unexpected message type', (msg as any).type)
      }
    }
  }
}
