'use client'

import { useState } from 'react'
import { clearOfflineNavigationCache } from 'next/offline'
import { useRouter } from 'next/navigation'

export function PrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-offline-navigation"
      onClick={() => router.prefetch('/prefetched')}
    >
      Prefetch offline navigation
    </button>
  )
}

export function DynamicPatternSourcePrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-dynamic-pattern-source"
      onClick={() => router.prefetch('/dynamic-prefetch/learned')}
    >
      Prefetch dynamic pattern source
    </button>
  )
}

export function DynamicPatternTargetPrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-dynamic-pattern-target"
      onClick={() => router.prefetch('/dynamic-prefetch/replayed')}
    >
      Prefetch dynamic pattern target
    </button>
  )
}

export function WorkspaceShellPrefetchButton() {
  const router = useRouter()
  return (
    <button
      id="prefetch-workspace-shell"
      onClick={() =>
        router.prefetch('/workspace/acme/channel/general/thread/123')
      }
    >
      Prefetch workspace shell
    </button>
  )
}

export function RefreshButton() {
  const router = useRouter()
  return (
    <button id="refresh-offline-navigation" onClick={() => router.refresh()}>
      Refresh offline navigation
    </button>
  )
}

export function ClearOfflineNavigationCacheButton() {
  const [result, setResult] = useState('idle')
  return (
    <>
      <button
        id="clear-offline-navigation-cache"
        onClick={async () => {
          setResult(
            (await clearOfflineNavigationCache()) ? 'cleared' : 'not-cleared'
          )
        }}
      >
        Clear offline navigation cache
      </button>
      <p id="clear-offline-navigation-cache-result">{result}</p>
    </>
  )
}

export function ResetOfflineNavigationSessionButton() {
  const [result, setResult] = useState('idle')
  return (
    <>
      <button
        id="reset-offline-navigation-session"
        onClick={async () => {
          document.cookie = 'offline-session=; Max-Age=0; path=/; SameSite=Lax'
          setResult(
            (await clearOfflineNavigationCache()) ? 'cleared' : 'not-cleared'
          )
        }}
      >
        Reset offline navigation session
      </button>
      <p id="reset-offline-navigation-session-result">{result}</p>
    </>
  )
}
