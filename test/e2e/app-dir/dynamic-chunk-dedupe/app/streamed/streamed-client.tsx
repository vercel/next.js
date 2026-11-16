'use client'

import dynamic from 'next/dynamic'

const StreamedWidget = dynamic(() => import('./streamed-widget'))

export function StreamedClient() {
  return <StreamedWidget />
}
