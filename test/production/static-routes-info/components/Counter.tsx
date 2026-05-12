'use client'

// Client component imported by App Router pages so `clientModules` in the
// per-route `_client-reference-manifest.js` actually has chunk references.
// Without this, webpack's clientModules entries all have `chunks: []` and
// the static-routes-info tool can't pick up any per-route client JS for
// webpack builds.
import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>count is {count}</button>
}
