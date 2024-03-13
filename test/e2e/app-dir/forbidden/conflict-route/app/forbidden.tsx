export default function Forbidden() {
  return (
    <>
      <h1>This Is The Forbidden Page</h1>

      <div id="timestamp">{Date.now()}</div>
    </>
  )
}

Forbidden.displayName = 'Forbidden'
