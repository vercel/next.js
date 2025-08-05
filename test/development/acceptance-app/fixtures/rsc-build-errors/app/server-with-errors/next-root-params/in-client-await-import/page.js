'use client'
// This currently bypasses the compile time import checks from `react_server_components.rs`,
// but we should still catch it during import resolution.
const { whatever } = await import('next/root-params')

console.log({ whatever })

export default function Page() {
  return null
}
