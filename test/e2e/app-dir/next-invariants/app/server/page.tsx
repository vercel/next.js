// Server component that references every __NEXT_INVARIANTS__ property.
// Used by the test to verify defineEnv replacement in server bundles.
export default function ServerPage() {
  return (
    <dl>
      <dt>isDevServer</dt>
      <dd id="server-isDevServer">{String(__NEXT_INVARIANTS__.isDevServer)}</dd>
      <dt>trailingSlash</dt>
      <dd id="server-trailingSlash">
        {String(__NEXT_INVARIANTS__.trailingSlash)}
      </dd>
      <dt>experimentalOptimisticRouting</dt>
      <dd id="server-experimentalOptimisticRouting">
        {String(__NEXT_INVARIANTS__.experimentalOptimisticRouting)}
      </dd>
    </dl>
  )
}
