// Where did this instance execute, and in which build mode?
// SSR and MODE are compile-time constants injected per bundle, so the server
// build renders env=server and the browser build renders env=client.
const where = import.meta.env.SSR ? 'server' : 'client'
const mode = import.meta.env.MODE

export default function DebugBadge() {
  return (
    <span className="debug-badge" suppressHydrationWarning>
      {`env=${where} mode=${mode}`}
    </span>
  )
}
