import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export const config = {
  runtime: 'experimental-edge',
}

export default function handler() {
  return Response.json({
    react: react.condition,
    serverFavoringBrowser: serverFavoringBrowser.condition,
    serverFavoringEdge: serverFavoringEdge.condition,
  })
}
