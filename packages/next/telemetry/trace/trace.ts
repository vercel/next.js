import { randomBytes } from 'crypto'
import { SpanId } from './shared'
import { report } from './report'

const NUM_OF_MICROSEC_IN_SEC = BigInt('1000')

const getId = () => randomBytes(8).toString('hex')

// eslint typescript has a bug with TS enums
/* eslint-disable no-shadow */
export enum SpanStatus {
  Started,
  Stopped,
}

export class Span {
  name: string
  id: SpanId
  parentId?: SpanId
  duration: number | null
  attrs: { [key: string]: any }
  status: SpanStatus

  _start: bigint

  constructor(name: string, parentId?: SpanId, attrs?: Object) {
    this.name = name
    this.parentId = parentId
    this.duration = null
    this.attrs = attrs ? { ...attrs } : {}
    this.status = SpanStatus.Started
    this.id = getId()
    this._start = process.hrtime.bigint()
  }

  // Durations are reported as microseconds. This gives 1000x the precision
  // of something like Date.now(), which reports in milliseconds.
  // Additionally, ~285 years can be safely represented as microseconds as
  // a float64 in both JSON and JavaScript.
  stop() {
    const end: bigint = process.hrtime.bigint()
    const duration = (end - this._start) / NUM_OF_MICROSEC_IN_SEC
    this.status = SpanStatus.Stopped
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    const timestamp = this._start / NUM_OF_MICROSEC_IN_SEC
    report(
      this.name,
      Number(duration),
      Number(timestamp),
      this.id,
      this.parentId,
      this.attrs
    )
  }

  traceChild(name: string, attrs?: Object) {
    return new Span(name, this.id, attrs)
  }

  setAttribute(key: string, value: any) {
    this.attrs[key] = value
  }

  traceFn(fn: any) {
    try {
      return fn()
    } finally {
      this.stop()
    }
  }

  async traceAsyncFn<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
      return await fn()
    } finally {
      this.stop()
    }
  }
}

export const trace = (name: string, parentId?: SpanId, attrs?: Object) => {
  return new Span(name, parentId, attrs)
}
