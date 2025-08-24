import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export const runtime = 'nodejs'

export function GET() {
  return Response.json({
    react: react.condition,
    serverFavoringBrowser: serverFavoringBrowser.condition,
    serverFavoringEdge: serverFavoringEdge.condition,
  })
}
