import { maybeInstallInvocationShutdownHook } from '../utils/simulated-invocation'

// (patched in tests)
// export const runtime = 'REPLACE_ME'
// export const dynamic = 'REPLACE_ME'

export default function AppLayout({ children }) {
  maybeInstallInvocationShutdownHook()
  return (
    <html>
      <head>
        <title>after</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
