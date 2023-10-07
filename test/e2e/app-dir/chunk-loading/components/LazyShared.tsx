import { lazy } from 'react'

const LazySuperShared = lazy(async () => {
  const module = await import('./SuperShared')
  return { default: module.SuperShared }
})

export function LazyShared() {
  return <LazySuperShared from="dynamic" />
}
