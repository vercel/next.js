import { customAlphabet } from 'next/dist/compiled/nanoid/index.cjs'
import { SpanId } from './shared'
import { reporter } from './report'

const NUM_OF_MICROSEC_IN_SEC = BigInt('1000')
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)
const getId = () => Buffer.from(nanoid(), 'utf8').toString('hex')

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

  constructor({
    name,
    parentId,
    attrs,
    startTime,
  }: {
    name: string
    parentId?: SpanId
    startTime?: bigint
    attrs?: Object
  }) {
    this.name = name
    this.parentId = parentId
    this.duration = null
    this.attrs = attrs ? { ...attrs } : {}
    this.status = SpanStatus.Started
    this.id = getId()
    this._start = startTime || process.hrtime.bigint()
  }

  // Durations are reported as microseconds. This gives 1000x the precision
  // of something like Date.now(), which reports in milliseconds.
  // Additionally, ~285 years can be safely represented as microseconds as
  // a float64 in both JSON and JavaScript.
  stop(stopTime?: bigint) {
    const end: bigint = stopTime || process.hrtime.bigint()
    const duration = (end - this._start) / NUM_OF_MICROSEC_IN_SEC
    this.status = SpanStatus.Stopped
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    const timestamp = this._start / NUM_OF_MICROSEC_IN_SEC
    reporter.report(
      this.name,
      Number(duration),
      Number(timestamp),
      this.id,
      this.parentId,
      this.attrs
    )
  }

  traceChild(name: string, attrs?: Object) {
    return new Span({ name, parentId: this.id, attrs })
  }

  manualTraceChild(
    name: string,
    startTime: bigint,
    stopTime: bigint,
    attrs?: Object
  ) {
    const span = new Span({ name, parentId: this.id, attrs, startTime })
    span.stop(stopTime)
  }

  setAttribute(key: string, value: any) {
    this.attrs[key] = String(value)
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

export const trace = (
  name: string,
  parentId?: SpanId,
  attrs?: { [key: string]: string }
) => {
  return new Span({ name, parentId, attrs })
}

export const flushAllTraces = () => reporter.flushAll()
