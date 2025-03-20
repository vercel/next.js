'use client'

import { ChannelSubscription } from '@/app/websockets/channel-subscription'
import { getWebsocketConfig } from '@/app/websockets/websocket-config'
import { lazy } from 'react'

void getWebsocketConfig()
void ChannelSubscription

export const ChatClient = lazy(() =>
  import('./chat.client').then((mod) => ({ default: mod.ChatClient }))
)

export default function DesktopLayout(props) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        {props.children}
        <ChatClient />
        {props.children}
      </body>
    </html>
  )
}
