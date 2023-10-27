export function Debug({ page, pathname }) {
  return <pre id="debug">{JSON.stringify({ page, pathname }, null, 2)}</pre>
}
