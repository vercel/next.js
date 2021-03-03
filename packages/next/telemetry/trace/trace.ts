import { randomBytes } from 'crypto'
import { SpanId } from './types'
import { report } from './report'

const ONE_THOUSAND = BigInt('1000')

let idCounter = 0
const idUniqToProcess = randomBytes(16).toString('base64').slice(0, 22)
const getId = () => `${idUniqToProcess}:${idCounter++}`

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

  stop() {
    const end: bigint = process.hrtime.bigint()
    const duration = (end - this._start) / ONE_THOUSAND
    this.status = SpanStatus.Stopped
    if (duration > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Duration is too long to express as float64: ${duration}`)
    }
    report(this.name, Number(duration), this.id, this.parentId, this.attrs)
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

  async traceAsyncFn(fn: any) {
    try {
      return await fn()
    } finally {
      this.stop()
    }
  }
}

// This function reports durations in microseconds. This gives 1000x
// the precision of something like Date.now(), which reports in
// milliseconds.  Additionally, ~285 years can be safely represented
// as microseconds as a float64 in both JSON and JavaScript.
export const trace = (name: string, parentId?: SpanId, attrs?: Object) => {
  return new Span(name, parentId, attrs)
}
