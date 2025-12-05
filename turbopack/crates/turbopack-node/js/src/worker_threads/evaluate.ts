import { threadId as workerId, workerData, parentPort } from 'worker_threads'
import { structuredError } from '../error'
import type { Channel } from '../types'
import { Binding, TaskChannel } from './taskChannel'

const binding: Binding = require(
  /* turbopackIgnore: true */ workerData.bindingPath
)

const KillMsg = '__kill__'

let willKill = false

parentPort!.on('message', (msg) => {
  if (msg === KillMsg) {
    willKill = true
  }
})

export const run = async (
  moduleFactory: () => Promise<{
    init?: () => Promise<void>
    default: (channel: Channel<any, any>, ...deserializedArgs: any[]) => any
  }>
) => {
  let getValue: (channel: Channel<any, any>, ...deserializedArgs: any[]) => any

  let isRunning = false
  let runningTask: Promise<void> | undefined

  const run = async (taskId: number, args: string[]) => {
    try {
      if (typeof getValue !== 'function') {
        const module = await moduleFactory()
        if (typeof module.init === 'function') {
          await module.init()
        }
        getValue = module.default
      }
      const value = await getValue(new TaskChannel(binding, taskId), ...args)
      console.log(`[worker ${workerId}] sending end task message for ${taskId}`)
      await binding.sendTaskMessage(
        taskId,
        JSON.stringify({
          type: 'end',
          data: value === undefined ? undefined : JSON.stringify(value),
          duration: 0,
        })
      )
      console.log(`[worker ${workerId}] sent end task message for ${taskId}`)
    } catch (err) {
      console.log(
        `[worker ${workerId}] sending error task message for ${taskId}`
      )
      await binding.sendTaskMessage(
        taskId,
        JSON.stringify({
          type: 'error',
          ...structuredError(err as Error),
        })
      )
      console.log(`[worker ${workerId}] sent error task message for ${taskId}`)
    }
    isRunning = false
    runningTask = undefined
  }

  const loop = async () => {
    console.log(`[worker ${workerId}] waiting for worker request`)
    let taskId: number | undefined
    let msg_str: string
    console.log(`[worker ${workerId}] received worker request ${taskId}`)

    console.log(`[worker ${workerId}] notifying worker ack ${taskId}`)
    if (isRunning) {
      msg_str = await binding.recvMessageInWorker(workerId)
    } else {
      taskId = await binding.recvWorkerRequest(workerData.poolId)
      await binding.notifyWorkerAck(taskId, workerId)
      console.log(`[worker ${workerId}] notified worker ack ${taskId}`)
      console.log(`[worker ${workerId}] waiting for message in worker`)
      msg_str = await binding.recvMessageInWorker(workerId)
      console.log(`[worker ${workerId}] received message in worker`)
    }

    const msg = JSON.parse(msg_str) as
      | {
        type: 'evaluate'
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
        if (!isRunning && taskId !== undefined) {
          isRunning = true
          runningTask = run(taskId, msg.args)
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

  while (true) {
    if (willKill) {
      if (runningTask) {
        await runningTask
      }
      parentPort!.postMessage(KillMsg)
      return
    }

    const loopTask = loop()

    if (!isRunning) {
      runningTask = loopTask
    }

    await loopTask
  }
}
