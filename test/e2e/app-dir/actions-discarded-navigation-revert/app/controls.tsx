'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { echo, reject, revalidate } from './actions'

// Rendered in the root layout so the statuses survive navigations.
export function Controls() {
  const router = useRouter()
  const [a, setA] = useState('idle')
  const [b, setB] = useState('idle')
  const [c, setC] = useState('idle')

  async function dispatchResolve() {
    setA('pending')
    try {
      setA(await echo('a-result'))
    } catch {
      setA('rejected')
    }
  }

  async function dispatchReject() {
    setA('pending')
    try {
      await reject()
      setA('resolved')
    } catch {
      setA('rejected')
    }
  }

  async function dispatchRevalidate() {
    setA('pending')
    try {
      setA(await revalidate())
    } catch {
      setA('rejected')
    }
  }

  async function dispatchB() {
    setB('pending')
    try {
      setB(await echo('b-result'))
    } catch {
      setB('rejected')
    }
  }

  async function dispatchC() {
    setC('pending')
    try {
      setC(await echo('c-result'))
    } catch {
      setC('rejected')
    }
  }

  return (
    <div>
      <button id="dispatch-resolve" onClick={dispatchResolve}>
        dispatch resolving action
      </button>
      <button id="dispatch-reject" onClick={dispatchReject}>
        dispatch rejecting action
      </button>
      <button id="dispatch-revalidate" onClick={dispatchRevalidate}>
        dispatch revalidating action
      </button>
      <button id="dispatch-b" onClick={dispatchB}>
        dispatch queued action
      </button>
      <button id="go-dest" onClick={() => router.push('/dest')}>
        go to destination
      </button>
      <button id="dispatch-c" onClick={dispatchC}>
        dispatch probe action
      </button>
      <div id="status-a" data-status={a}>
        a:{a}
      </div>
      <div id="status-b" data-status={b}>
        b:{b}
      </div>
      <div id="status-c" data-status={c}>
        c:{c}
      </div>
    </div>
  )
}
