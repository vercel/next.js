import { NextResponse } from 'next/server'
import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export function middleware() {
  const response = NextResponse.next()

  response.headers.set('x-react-condition', react.condition)
  response.headers.set(
    'x-server-favoring-browser-condition',
    serverFavoringBrowser.condition
  )
  response.headers.set(
    'x-server-favoring-edge-condition',
    serverFavoringEdge.condition
  )

  return response
}
