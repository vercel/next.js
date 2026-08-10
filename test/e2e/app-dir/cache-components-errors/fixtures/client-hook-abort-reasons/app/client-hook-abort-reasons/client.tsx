'use client'

import {
  useParams,
  usePathname,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from 'next/navigation'

export function SyncIO() {
  Date.now()
  return <p>sync IO slot</p>
}

export function UseParams() {
  useParams()
  return <p>hook slot: useParams</p>
}

export function UsePathname() {
  usePathname()
  return <p>hook slot: usePathname</p>
}

export function UseSearchParams() {
  useSearchParams()
  return <p>hook slot: useSearchParams</p>
}

export function UseSelectedLayoutSegment() {
  useSelectedLayoutSegment()
  return <p>hook slot: useSelectedLayoutSegment</p>
}

export function UseSelectedLayoutSegments() {
  useSelectedLayoutSegments()
  return <p>hook slot: useSelectedLayoutSegments</p>
}
