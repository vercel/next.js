'use client'

import { SuperShared } from '../../components/SuperShared'
import { LazyShared } from '../../components/LazyShared'

export function ClientShared() {
  return <SuperShared from="fizz" />
}

export function ClientDynamicShared() {
  return <LazyShared />
}
