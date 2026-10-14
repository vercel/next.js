'use client'

import dynamic from 'next/dynamic'

// Each `dynamic()` import becomes its own async chunk. The server-rendered ones
// are already in the DOM as `<script>` / `<link>` tags when the runtime loads
// them during hydration; the `ssr: false` ones are inserted by the runtime.
const WidgetA = dynamic(() => import('./widget-a'))
const WidgetB = dynamic(() => import('./widget-b'))
const WidgetC = dynamic(() => import('./widget-c'))
const StyledServer = dynamic(() => import('./styled-server'))
const StyledClient = dynamic(() => import('./styled-client'), { ssr: false })

export function Widgets() {
  return (
    <>
      <WidgetA />
      <WidgetB />
      <WidgetC />
      <StyledServer />
      <StyledClient />
    </>
  )
}
