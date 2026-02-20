'use client'
export default function IsDevServer() {
  return <dd id="isDevServer">{String(__NEXT_INVARIANTS__.isDevServer)}</dd>
}
