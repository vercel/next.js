import type { NextApiRequest, NextApiResponse } from 'next'

type Attributes = Record<string, unknown>

const spans: { name: string; attributes: Attributes }[] = []

// A minimal tracer provider that keeps the spans it starts.
class RecordingSpan {
  name: string
  attributes: Attributes

  constructor(name: string, attributes?: Attributes) {
    this.name = name
    this.attributes = { ...attributes }
    spans.push(this)
  }
  spanContext() {
    return {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    }
  }
  setAttribute(key: string, value: unknown) {
    this.attributes[key] = value
    return this
  }
  setAttributes(attributes: Attributes) {
    Object.assign(this.attributes, attributes)
    return this
  }
  addEvent() {
    return this
  }
  setStatus() {
    return this
  }
  updateName(name: string) {
    this.name = name
    return this
  }
  end() {}
  isRecording() {
    return true
  }
  recordException() {}
}

const tracer = {
  startSpan(name: string, options?: { attributes?: Attributes }) {
    return new RecordingSpan(name, options?.attributes)
  },
  startActiveSpan(name: string, ...args: unknown[]) {
    const fn = args.pop() as (span: RecordingSpan) => unknown
    const options = args[0] as { attributes?: Attributes } | undefined
    return fn(new RecordingSpan(name, options?.attributes))
  },
}

// `POST` registers the tracer provider. Every method returns the spans that
// were started so far.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // This app doesn't install `@opentelemetry/api`, so the Next.js tracer uses
    // the copy that ships with Next.js. Register with that copy.
    const { trace } = require('next/dist/compiled/@opentelemetry/api')
    trace.setGlobalTracerProvider({ getTracer: () => tracer })
  }

  res
    .status(200)
    .json(spans.map(({ name, attributes }) => ({ name, attributes })))
}
