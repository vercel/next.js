import * as React from 'react'
import * as react from 'library-with-exports/react'
import * as serverFavoringBrowser from 'library-with-exports/server-favoring-browser'
import * as serverFavoringEdge from 'library-with-exports/server-favoring-edge'

export const config = {
  runtime: 'experimental-edge',
}

let server = {
  react: react.condition,
  serverFavoringBrowser: serverFavoringBrowser.condition,
  serverFavoringEdge: serverFavoringEdge.condition,
}
if (typeof window !== 'undefined') {
  server = JSON.parse(
    document.querySelector('[data-testid="server"]')!.textContent!
  )
}

export default function Page() {
  const [client, setClient] = React.useState<unknown | null>(null)

  React.useLayoutEffect(() => {
    setClient({
      react: react.condition,
      serverFavoringBrowser: serverFavoringBrowser.condition,
      serverFavoringEdge: serverFavoringEdge.condition,
    })
  }, [])

  return (
    <output aria-busy={client === null}>
      {client === null ? (
        <pre data-testid="server">{JSON.stringify(server, null, 2)}</pre>
      ) : (
        <pre suppressHydrationWarning={true}>
          {JSON.stringify({ server, client }, null, 2)}
        </pre>
      )}
    </output>
  )
}
