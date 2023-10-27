export default function NotFound() {
  return (
    <>
      <h1>This Is The Not Found Page</h1>

      <div id="timestamp">{Date.now()}</div>
    </>
  )
}

NotFound.displayName = 'NotFound'
