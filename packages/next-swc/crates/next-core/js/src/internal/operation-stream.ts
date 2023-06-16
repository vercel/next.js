// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from '@vercel/turbopack-node/ipc/index'

import { Buffer } from 'node:buffer'

import type { Ipc } from '@vercel/turbopack-node/ipc/index'

type Operation =
  | {
      streamRequest: true
      onChunk?: (chunk: Buffer) => Promise<void>
      onEnd?: () => Promise<void>
    }
  | {
      streamRequest?: false
      onBody?: (body: Buffer) => Promise<void>
    }

type IpcIncomingMessage<T> =
  | {
      type: 'headers'
      data: T
    }
  | {
      type: 'bodyChunk'
      data: number[]
    }
  | {
      type: 'bodyText'
      data: number[]
    }
  | { type: 'bodyEnd' }

type IpcOutgoingMessage<R> =
  | {
      type: 'headers'
      data: R
    }
  | {
      type: 'bodyChunk'
      data: number[]
    }
  | {
      type: 'bodyEnd'
    }

interface Response {
  chunk: (data: Buffer) => Promise<void>
  end: () => Promise<void>
}

export default function startHandler<T, R>(
  createOperation: (
    data: T,
    respond: (data: R) => Response,
    reportError: (error: unknown) => Promise<never>
  ) => Promise<Operation | void>
) {
  const ipc = IPC as Ipc<IpcIncomingMessage<T>, IpcOutgoingMessage<R>>

  ;(async () => {
    while (true) {
      let operation: Operation | void

      {
        const msg = await ipc.recv()

        switch (msg.type) {
          case 'headers': {
            operation = await createOperation(
              msg.data,
              (data) => {
                ipc.send({
                  type: 'headers',
                  data,
                })
                return {
                  chunk: (buf: Buffer) => {
                    return ipc.send({
                      type: 'bodyChunk',
                      data: buf.toJSON().data,
                    })
                  },
                  end: () => {
                    return ipc.send({ type: 'bodyEnd' })
                  },
                }
              },
              (error) => {
                return ipc.sendError(
                  error instanceof Error
                    ? error
                    : new Error(`an unknown error occurred: ${error}`)
                )
              }
            )
            break
          }
          default: {
            console.error('unexpected message type', msg.type)
            process.exit(1)
          }
        }
      }

      if (operation) {
        if (operation.streamRequest) {
          loop: while (true) {
            const msg = await ipc.recv()

            switch (msg.type) {
              case 'bodyChunk':
              case 'bodyText': {
                await operation.onChunk?.(Buffer.from(msg.data))
                break
              }
              case 'bodyEnd': {
                await operation.onEnd?.()
                break loop
              }
              default: {
                console.error('unexpected message type', msg.type)
                process.exit(1)
              }
            }
          }
        } else {
          let body = Buffer.alloc(0)
          loop: while (true) {
            const msg = await ipc.recv()

            switch (msg.type) {
              case 'bodyChunk':
              case 'bodyText': {
                body = Buffer.concat([body, Buffer.from(msg.data)])
                break
              }
              case 'bodyEnd': {
                await operation.onBody?.(body)
                break loop
              }
              default: {
                console.error('unexpected message type', msg.type)
                process.exit(1)
              }
            }
          }
        }
      }
    }
  })().catch((err) => {
    ipc.sendError(err)
  })
}
