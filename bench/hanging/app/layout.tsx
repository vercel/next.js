'use client'

import dynamic from 'next/dynamic'

import { ChannelSubscription } from '@/app/websockets/channel-subscription'
import { getWebsocketConfig } from '@/app/websockets/websocket-config'

void getWebsocketConfig()
void ChannelSubscription

export const ChatClient = dynamic(
  () => import('./chat.client').then((mod) => mod.ChatClient),
  {
    ssr: false,
  }
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
