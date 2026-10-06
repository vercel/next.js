export default function Page() {
  // Logged at build time when prerendered, and per request in dev.
  console.log('UPGRADE_TERMINAL_ROUTE_RENDERED')
  return <p>hello world</p>
}
