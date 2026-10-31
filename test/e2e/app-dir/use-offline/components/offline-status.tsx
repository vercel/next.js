'use client'
import { useOffline } from 'next/offline'

export function OfflineStatus() {
  const isOffline = useOffline()
  return <div id="offline-status">{isOffline ? 'offline' : 'online'}</div>
}
