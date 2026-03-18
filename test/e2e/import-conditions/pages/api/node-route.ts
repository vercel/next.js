import type { NextApiRequest, NextApiResponse } from 'next'
import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export const config = {
  runtime: 'nodejs',
}

export default function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  return response.status(200).json({
    react: react.condition,
    serverFavoringBrowser: serverFavoringBrowser.condition,
    serverFavoringEdge: serverFavoringEdge.condition,
  })
}
