'use client'

import {
  startTransition,
  Suspense,
  useState,
  version,
  type ReactNode,
} from 'react'

const { createFromReadableStream } = require('react-server-dom-webpack/client')

type Chunk = {
  status: string
  value: unknown
  then: (
    this: Chunk,
    resolve: (value: unknown) => void,
    reject: (error: unknown) => void
  ) => void
}

type Flight = {
  child: ReactNode
  chunk: Chunk
  deliver: () => void
  queued: boolean
  synchronous: boolean
  events: string[]
}

declare global {
  interface Window {
    flight: {
      release: () => void
      inspect: () => {
        status: string
        subscribed: boolean
        events: string[]
        version: string
      }
    }
  }
}

function FlightChild({ flight }: { flight: Flight }) {
  flight.events.push('render:' + flight.chunk.status)
  if (flight.synchronous && !flight.queued) {
    flight.queued = true
    // resolveLazy yields after reading the pending chunk, before React attaches
    // its ping listener. Deliver the row during that yield. Flight leaves it
    // resolved_model, so subscribing during the resumed render pings inline.
    queueMicrotask(flight.deliver)
  }
  return flight.child
}

export default function Page() {
  const [flight, setFlight] = useState<Flight | null>(null)
  const [count, setCount] = useState(0)

  async function start(synchronous: boolean) {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
        // The root resolves to a lazy element whose model row is still pending.
        value.enqueue(encoder.encode('0:"$L1"\n'))
      },
    })
    const child = await createFromReadableStream(stream)
    const chunk: Chunk = child._payload
    const events: string[] = []
    const originalThen = chunk.then
    chunk.then = function (resolve, reject) {
      events.push('subscribe:' + this.status)
      let insideThen = true
      originalThen.call(
        this,
        (value) => {
          events.push(insideThen ? 'ping:sync' : 'ping:async')
          resolve(value)
        },
        reject
      )
      insideThen = false
    }

    const nextFlight: Flight = {
      child,
      chunk,
      queued: false,
      synchronous,
      events,
      deliver() {
        controller.enqueue(
          encoder.encode(
            '1:["$","p",null,{"id":"content","children":"Updated"}]\n'
          )
        )
        controller.close()
        queueMicrotask(() => events.push('delivered:' + chunk.status))
      },
    }
    window.flight = {
      release: nextFlight.deliver,
      inspect: () => ({
        status: chunk.status,
        subscribed: Array.isArray(chunk.value),
        events: [...events],
        version,
      }),
    }
    startTransition(() => setFlight(nextFlight))
  }

  return (
    <>
      <button id="synchronous" onClick={() => start(true)}>
        Synchronous Flight ping
      </button>
      <button id="asynchronous" onClick={() => start(false)}>
        Asynchronous Flight ping
      </button>
      <button id="unrelated" onClick={() => setCount(count + 1)}>
        Unrelated update: {count}
      </button>
      <Suspense fallback={<p>Loading</p>}>
        {flight ? <FlightChild flight={flight} /> : <p id="content">Initial</p>}
      </Suspense>
    </>
  )
}
