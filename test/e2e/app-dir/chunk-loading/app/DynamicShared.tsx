import { lazy } from 'react'

const LazyShared = lazy(async () => {
  const module = await import('./SuperShared')
  return { default: module.SuperShared }
})

export function DynamicShared() {
  return <LazyShared from="dynamic" />
}
