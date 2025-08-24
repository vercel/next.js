import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'
import ClientPage from '../ClientPage'

export const runtime = 'nodejs'

async function action() {
  'use server'
  return {
    react: react.condition,
    serverFavoringBrowser: serverFavoringBrowser.condition,
    serverFavoringEdge: serverFavoringEdge.condition,
  }
}

export default function Page() {
  return (
    <ClientPage
      action={action}
      server={{
        react: react.condition,
        serverFavoringBrowser: serverFavoringBrowser.condition,
        serverFavoringEdge: serverFavoringEdge.condition,
      }}
    />
  )
}
