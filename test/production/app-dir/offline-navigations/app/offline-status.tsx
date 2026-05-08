'use client'

import { useOffline } from 'next/offline'

export function OfflineStatus() {
  const isOffline = useOffline()
  return <p id="offline-status">{isOffline ? 'offline' : 'online'}</p>
}
