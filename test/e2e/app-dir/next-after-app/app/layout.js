import { installInvocationShutdownHook } from '../utils/simulated-invocation'

// (patched in tests)
// export const runtime = 'REPLACE_ME'
// export const dynamic = 'REPLACE_ME'
const shouldInstallShutdownHook = false

export default function AppLayout({ children }) {
  if (shouldInstallShutdownHook) {
    installInvocationShutdownHook()
  }
  return (
    <html>
      <head>
        <title>after</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
