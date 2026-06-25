import { useMessageFormatter } from 'dual-pkg'

// `dual-pkg` is externalized via `serverExternalPackages`. It is rendered
// per-request on the server. With the Turbopack externalization bug the flat
// CommonJS copy is loaded at runtime, where `useMessageFormatter` is undefined,
// so this throws.
export const dynamic = 'force-dynamic'

export default function Page() {
  return <p id="message">{useMessageFormatter()}</p>
}
