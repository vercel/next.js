import 'next/app'
// FIXME
// import 'next/babel';
import 'next/cache'
import 'next/client'
import 'next/constants'
import 'next/document'
import 'next/dynamic'
import 'next/error'
import 'next/head'
import 'next/headers'
import 'next/image'
import 'next'
// TODO @jest/types is an undeclared peer dependecy
// import 'next/jest';
import 'next/link'
import 'next/navigation'
import 'next/og'
import 'next/router'
import 'next/script'
import { NextResponse } from 'next/server'
import type {
  WebSocketCloseDetails,
  WebSocketHooks,
  WebSocketMessage,
  WebSocketMessageData,
  WebSocketPeer,
  WebSocketUpgradeOptions,
} from 'next/server'
// FIXME
// import 'next/web-vitals';

const webSocketHooks = {
  open(peer: WebSocketPeer) {
    const requestUrl: string = peer.request.url
    const payload: WebSocketMessageData = new Uint8Array([1, 2, 3])
    peer.send(payload)
    void requestUrl
  },
  message(peer: WebSocketPeer, message: WebSocketMessage) {
    const payload: ArrayBuffer = message.arrayBuffer()
    peer.send(payload)
  },
  close(_peer: WebSocketPeer, details: WebSocketCloseDetails) {
    const code: number = details.code
    void code
  },
  error(_peer: WebSocketPeer, error: Error) {
    const message: string = error.message
    void message
  },
} satisfies WebSocketHooks

const webSocketUpgradeOptions = {
  protocol: 'chat.v1',
} satisfies WebSocketUpgradeOptions
const webSocketUpgradeResponse: NextResponse<null> = NextResponse.upgrade(
  webSocketHooks,
  webSocketUpgradeOptions
)

void webSocketUpgradeResponse
