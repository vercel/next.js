'use client'

import { SuperShared } from '../SuperShared'
import { DynamicShared } from '../DynamicShared'

export function ClientShared() {
  return <SuperShared from="fizz" />
}

export function ClientDynamicShared() {
  return <DynamicShared />
}
