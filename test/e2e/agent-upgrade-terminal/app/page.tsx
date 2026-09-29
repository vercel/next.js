export default function Page() {
  // Exercise the menu's output limit while a production build renders this route.
  if (process.env.UPGRADE_TERMINAL_TEST_OVERFLOW === '1') {
    console.log('x'.repeat(1024 * 1024 + 1))
  }
  // Mark route output so the terminal test can check buffering and replay.
  console.log(`UPGRADE_TERMINAL_ROUTE_RENDERED TTY=${process.stdout.isTTY}`)
  return <p>hello world</p>
}
