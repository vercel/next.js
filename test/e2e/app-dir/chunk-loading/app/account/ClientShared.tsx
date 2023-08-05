'use client'

import { SuperShared } from '../../components/SuperShared'
import { LazyShared } from '../../components/LazyShared'
import 'client-only'

export function ClientShared() {
  return <SuperShared from="fizz" />
}

export function ClientDynamicShared() {
  return <LazyShared />
}
