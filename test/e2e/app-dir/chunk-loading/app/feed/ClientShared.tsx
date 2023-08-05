'use client'

import { useReducer } from 'react'

import { LazyShared } from '../../components/LazyShared'

export function ClientDynamicShared() {
  let [shouldload, load] = useReducer(() => true, false)
  if (shouldload) {
    return <LazyShared />
  } else {
    return <button onClick={load}>Load module</button>
  }
}
