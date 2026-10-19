import { IPC } from './index'
import { loadEvaluation } from '../evaluation'
import type { Ipc as GenericIpc } from './index'

type IpcIncomingMessage =
  | {
      type: 'evaluate'
      entry: string
      args: string[]
    }
  | {
      type: 'result'
      id: number
      error: string | null
      data: any | null
    }

type IpcOutgoingMessage =
  | {
      type: 'end'
      data: string | undefined
      duration: number
    }
  | {
      type: 'info'
      data: any
    }
  | {
      type: 'request'
      id: number
      data: any
    }

const ipc = IPC as GenericIpc<IpcIncomingMessage, IpcOutgoingMessage>

const queue: Array<{ entry: string; args: string[] }> = []

export const run = async () => {
  let nextId = 1
  const requests = new Map()
  const internalIpc = {
    sendInfo: (message: any) =>
      ipc.send({
        type: 'info',
        data: message,
      }),
    sendRequest: (message: any) => {
      const id = nextId++
      let resolve, reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      requests.set(id, { resolve, reject })
      return ipc
        .send({ type: 'request', id, data: message })
        .then(() => promise)
    },
    sendError: (error: Error) => {
      return ipc.sendError(error)
    },
  }

  // Only the generic bootstrap owns the IPC connection. Evaluation modules are loaded on demand.
  await ipc.sendReady()

  // Queue handling
  let isRunning = false
  const run = async () => {
    while (queue.length > 0) {
      const { entry, args } = queue.shift()!
      try {
        const getValue = await loadEvaluation(entry)
        const value = await getValue(internalIpc, ...args)
        await ipc.send({
          type: 'end',
          data:
            value === undefined ? undefined : JSON.stringify(value, null, 2),
          duration: 0,
        })
      } catch (e) {
        await ipc.sendError(e as Error)
      }
    }
    isRunning = false
  }

  // Communication handling
  while (true) {
    const msg = await ipc.recv()

    switch (msg.type) {
      case 'evaluate': {
        queue.push({ entry: msg.entry, args: msg.args })
        if (!isRunning) {
          isRunning = true
          run()
        }
        break
      }
      case 'result': {
        const request = requests.get(msg.id)
        if (request) {
          requests.delete(msg.id)
          if (msg.error) {
            request.reject(new Error(msg.error))
          } else {
            request.resolve(msg.data)
          }
        }
        break
      }
      default: {
        console.error('unexpected message type', (msg as any).type)
        process.exit(1)
      }
    }
  }
}

export type { IpcIncomingMessage, IpcOutgoingMessage }
