'use client'

import { useState } from 'react'
import { slowRead, fastRead, maybeFail, redirectFromAction } from '../actions'
import { slowCache } from '../cache'

// Unique label per click, so cache calls always miss and runs never collide.
let seq = 0
const nonce = () => `${Date.now()}-${seq++}`

export function Fanout() {
  const [out, setOut] = useState<Record<string, string>>({})
  const set = (key: string, value: unknown) =>
    setOut((o) => ({ ...o, [key]: JSON.stringify(value) }))

  const fireCache = async () => {
    const n = nonce()
    set(
      'cache',
      await Promise.all([
        slowCache(`c1-${n}`),
        slowCache(`c2-${n}`),
        slowCache(`c3-${n}`),
      ])
    )
  }

  const fireRead = async () => {
    const n = nonce()
    set(
      'read',
      await Promise.all([
        slowRead(`r1-${n}`),
        slowRead(`r2-${n}`),
        slowRead(`r3-${n}`),
      ])
    )
  }

  const fireMixed = async () => {
    const n = nonce()
    set(
      'mixed',
      await Promise.all([
        slowRead(`m1-${n}`),
        slowCache(`m2-${n}`),
        slowRead(`m3-${n}`),
      ])
    )
  }

  // Start slow then fast without awaiting; record which finishes first. If calls
  // were serial we'd see 'slow' first; in parallel the quick one wins: 'fast'.
  const fireOrder = async () => {
    const n = nonce()
    const order: string[] = []
    const slow = slowRead(`slow-${n}`).then(() => order.push('slow'))
    const fast = fastRead(`fast-${n}`).then(() => order.push('fast'))
    await Promise.all([slow, fast])
    set('order', order)
  }

  const fireError = async () => {
    const n = nonce()
    const results = await Promise.allSettled([
      maybeFail(`ok1-${n}`, false),
      maybeFail(`bad-${n}`, true),
      maybeFail(`ok2-${n}`, false),
    ])
    set(
      'error',
      results.map((r) => r.status)
    )
  }

  const fireLarge = async () => {
    const n = nonce()
    set(
      'large',
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => slowRead(`L${i}-${n}`))
      )
    )
  }

  const fireBound = async () => {
    const n = nonce()
    const b1 = slowRead.bind(null, `b1-${n}`)
    const b2 = slowRead.bind(null, `b2-${n}`)
    const b3 = slowRead.bind(null, `b3-${n}`)
    set('bound', await Promise.all([b1(), b2(), b3()]))
  }

  const fireRedirect = () => {
    // The action redirects: the router does the navigation, and the call itself
    // rejects with a handled redirect error, so we swallow it.
    redirectFromAction('/mutations').catch(() => {})
  }

  return (
    <main>
      <button data-testid="fire-cache" onClick={fireCache}>
        cache
      </button>
      <button data-testid="fire-read" onClick={fireRead}>
        read
      </button>
      <button data-testid="fire-mixed" onClick={fireMixed}>
        mixed
      </button>
      <button data-testid="fire-order" onClick={fireOrder}>
        order
      </button>
      <button data-testid="fire-error" onClick={fireError}>
        error
      </button>
      <button data-testid="fire-large" onClick={fireLarge}>
        large
      </button>
      <button data-testid="fire-bound" onClick={fireBound}>
        bound
      </button>
      <button data-testid="fire-redirect" onClick={fireRedirect}>
        redirect
      </button>
      <pre data-testid="out-cache">{out.cache ?? ''}</pre>
      <pre data-testid="out-read">{out.read ?? ''}</pre>
      <pre data-testid="out-mixed">{out.mixed ?? ''}</pre>
      <pre data-testid="out-order">{out.order ?? ''}</pre>
      <pre data-testid="out-error">{out.error ?? ''}</pre>
      <pre data-testid="out-large">{out.large ?? ''}</pre>
      <pre data-testid="out-bound">{out.bound ?? ''}</pre>
    </main>
  )
}
