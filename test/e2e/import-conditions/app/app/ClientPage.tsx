'use client'
import * as React from 'react'
import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export default function ClientPage({
  action,
  server,
}: {
  action: () => Promise<Record<string, string>>
  server: unknown
}) {
  const [actionValue, formAction, isPending] = React.useActionState(
    action,
    undefined
  )
  const [client, setClient] = React.useState<unknown | null>(null)
  React.useEffect(() => {
    setClient({
      react: react.condition,
      serverFavoringBrowser: serverFavoringBrowser.condition,
      serverFavoringEdge: serverFavoringEdge.condition,
    })
  }, [])

  return (
    <form action={formAction}>
      <input type="submit" />
      <output aria-busy={client === null || isPending}>
        {client === null ? (
          <pre>{JSON.stringify({ server }, null, 2)}</pre>
        ) : (
          <pre>
            {JSON.stringify({ server, client, action: actionValue }, null, 2)}
          </pre>
        )}
      </output>
    </form>
  )
}
