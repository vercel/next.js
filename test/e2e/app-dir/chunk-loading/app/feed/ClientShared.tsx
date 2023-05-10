'use client'

import { useReducer } from 'react'

import { DynamicShared } from '../DynamicShared'

export function ClientDynamicShared() {
  let [shouldload, load] = useReducer(() => true, false)
  if (shouldload) {
    return <DynamicShared />
  } else {
    return <button onClick={load}>Load module</button>
  }
}
