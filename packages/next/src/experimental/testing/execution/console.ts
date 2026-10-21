import { Console } from 'node:console'
import { Writable } from 'node:stream'
import type { ResultEvent } from '../reporting/events'

const realDateNow = Date.now.bind(Date)
const realQueueMicrotask = globalThis.queueMicrotask.bind(globalThis)
type Output = Extract<ResultEvent, { type: 'output' }>
export type ConsoleTask = Pick<Output, 'caseId' | 'attempt'> & {
  taskId: string
}

/** Console writes retain their real asynchronous task before IPC or pipe delivery. */
export function installTestConsole(options: {
  fileId: string
  getTask(): ConsoleTask | undefined
  publish(
    output: Pick<
      Output,
      'stream' | 'text' | 'console' | 'timestamp' | 'caseId' | 'attempt'
    >
  ): Promise<void>
}) {
  type Buffer = { text: string[]; time: number; task: ConsoleTask }
  type Buffers = { stdout?: Buffer; stderr?: Buffer; sequence: number }
  const buffers = new Map<string, Buffers>()
  const pending = new Set<Promise<void>>()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'console')!
  let active = true
  let failure: unknown
  const publish = (stream: 'stdout' | 'stderr', buffer: Buffer) => {
    const result = options.publish({
      stream,
      text: buffer.text.join('') || '<empty line>',
      timestamp: buffer.time,
      console: { taskId: buffer.task.taskId, size: buffer.text.length },
      ...(buffer.task.caseId
        ? { caseId: buffer.task.caseId, attempt: buffer.task.attempt }
        : {}),
    })
    pending.add(result)
    void result.then(
      () => pending.delete(result),
      (error) => {
        failure ??= error
        pending.delete(result)
      }
    )
  }
  function flushTask(key: string) {
    const task = buffers.get(key)
    if (!task) return
    buffers.delete(key)
    const order =
      (task.stderr?.time ?? Infinity) < (task.stdout?.time ?? Infinity)
        ? (['stderr', 'stdout'] as const)
        : (['stdout', 'stderr'] as const)
    for (const stream of order) if (task[stream]) publish(stream, task[stream]!)
  }
  const stream = (type: 'stdout' | 'stderr') =>
    new Writable({
      write(chunk, _encoding, callback) {
        if (!active) {
          process[type].write(chunk)
          callback()
          return
        }
        const task = options.getTask() ?? { taskId: options.fileId }
        let buffer = buffers.get(task.taskId)
        if (!buffer) {
          buffer = { sequence: 0 }
          buffers.set(task.taskId, buffer)
        }
        const value = (buffer[type] ??= { text: [], time: realDateNow(), task })
        value.text.push(String(chunk))
        const sequence = ++buffer.sequence
        realQueueMicrotask(() => {
          if (buffers.get(task.taskId)?.sequence === sequence)
            flushTask(task.taskId)
        })
        callback()
      },
    })
  // Same console inspection color selection as the pinned tinyrainbow producer.
  const colorMode =
    !('NO_COLOR' in process.env || process.argv.includes('--no-color')) &&
    ('FORCE_COLOR' in process.env ||
      process.argv.includes('--color') ||
      process.platform === 'win32' ||
      (process.env.FORCE_TTY !== 'false' && process.env.TERM !== 'dumb') ||
      'CI' in process.env)
  Object.defineProperty(globalThis, 'console', {
    ...descriptor,
    value: new Console({
      stdout: stream('stdout'),
      stderr: stream('stderr'),
      colorMode,
      groupIndentation: 2,
    }),
  })
  return {
    async dispose() {
      if (active) {
        for (const key of buffers.keys()) flushTask(key)
        active = false
        Object.defineProperty(globalThis, 'console', descriptor)
      }
      while (pending.size) await Promise.allSettled([...pending])
      if (failure) throw failure
    },
  }
}
