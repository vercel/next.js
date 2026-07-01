import { structuredError } from '../error'

export const TEXT_ENCODER = new TextEncoder()
export const TEXT_DECODER = new TextDecoder()

export interface TaskMessage {
  taskId: number
  data: Uint8Array
}

export interface Binding {
  recvTaskMessageInWorker(workerId: number): Promise<TaskMessage>
  sendTaskMessage(msg: TaskMessage): void
  workerCreated(workerId: number): void
}

// Export this, maybe in the future, we can add an implementation via web worker on browser
export class TaskChannel {
  static nextId = 1
  static requests = new Map()

  constructor(
    private binding: Binding,
    private taskId: number
  ) {}

  async sendInfo(message: any) {
    return await this.binding.sendTaskMessage({
      taskId: this.taskId,
      data: TEXT_ENCODER.encode(
        JSON.stringify({
          type: 'info',
          data: message,
        })
      ),
    })
  }

  async sendRequest(message: any) {
    const id = TaskChannel.nextId++
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    TaskChannel.requests.set(id, { resolve, reject })
    // sendTaskMessage used to be async, but ran into issues with
    // napi-rs#3357.
    // Now we send this message sync.
    // But the resolve still happens async.
    this.binding.sendTaskMessage({
      taskId: this.taskId,
      data: TEXT_ENCODER.encode(
        JSON.stringify({ type: 'request', id, data: message })
      ),
    })
    return await promise
  }

  async sendError(error: Error) {
    try {
      await this.binding.sendTaskMessage({
        taskId: this.taskId,
        data: TEXT_ENCODER.encode(
          JSON.stringify({
            type: 'error',
            ...structuredError(error),
          })
        ),
      })
    } catch (err) {
      // There's nothing we can do about errors that happen after this point, we can't tell anyone
      // about them.
      console.error('failed to send error back to rust:', err)
    }
  }
}
