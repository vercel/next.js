'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function NavigateAndTrackRouterIdentity({ href }) {
  const router = useRouter()
  const [prevRouter, setPrevRouter] = useState(router)

  const [changedCount, setChangedCount] = useState(0)
  if (prevRouter !== router) {
    setPrevRouter(router)
    setChangedCount((p) => p + 1)
  }

  const [navigationCount, setNavigationCount] = useState(0)
  const navigate = () => {
    setNavigationCount((p) => p + 1)
    console.log('navigating to', href)
    router.push(href)
  }

  return (
    <>
      <div>
        navigations (without unmounting this component):{' '}
        <span id="count-from-client-state">{navigationCount}</span>
      </div>
      <div>
        router identity changes:{' '}
        <span id="router-change-count">{changedCount}</span>
      </div>
      <button id="trigger-push" onClick={navigate}>
        navigate
      </button>
    </>
  )
}
