'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LinkAccordion } from '../../../components/link-accordion'
import { refreshAction } from '../../actions'

export function DynamicRenderCounterClient({ uuid }: { uuid: string }) {
  // Counts how many times this component has received a new uuid from the
  // server. The count lives in React state, so it's preserved when the
  // bfcacheId is stable across navigations and reset when the segment is
  // recreated. Useful as a visual signal that the dynamic part re-ran.
  const [count, setCount] = useState(0)
  const [prevUuid, setPrevUuid] = useState(uuid)
  if (prevUuid !== uuid) {
    setPrevUuid(uuid)
    setCount(count + 1)
  }
  return <p data-testid="dynamic-render-counter">dynamic renders: {count}</p>
}

export function LeafContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { bfcacheId } = router
  const search = searchParams.toString()
  return (
    <>
      <h1 data-testid="pathname">{pathname}</h1>
      <span data-testid="search" data-value={search}>
        {search}
      </span>
      <form key={bfcacheId}>
        <input data-testid="leaf-input" defaultValue="" />
      </form>
      <LinkAccordion href={`${pathname}?q=2`}>same page (?q=2)</LinkAccordion>
      <LinkAccordion href={`${pathname}#section`}>
        same page (#section)
      </LinkAccordion>
      <button data-testid="refresh" onClick={() => router.refresh()}>
        refresh
      </button>
      <form action={refreshAction}>
        <button data-testid="server-action-refresh" type="submit">
          server action refresh
        </button>
      </form>
    </>
  )
}
