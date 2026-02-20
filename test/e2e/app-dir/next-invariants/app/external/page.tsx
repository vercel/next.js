// @ts-expect-error -- local test package, no types
import { getInvariants } from 'invariants-external-package'

// Server component that reads invariants from an external (non-bundled) package.
// The external package reads from the runtime global on globalThis, not via
// defineEnv static replacement.
export default function ExternalPage() {
  const invariants = getInvariants()
  return (
    <dl>
      <dt>isDevServer</dt>
      <dd id="external-isDevServer">{String(invariants.isDevServer)}</dd>
      <dt>trailingSlash</dt>
      <dd id="external-trailingSlash">{String(invariants.trailingSlash)}</dd>
      <dt>experimentalOptimisticRouting</dt>
      <dd id="external-experimentalOptimisticRouting">
        {String(invariants.experimentalOptimisticRouting)}
      </dd>
    </dl>
  )
}
