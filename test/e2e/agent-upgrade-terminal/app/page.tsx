export default function Page() {
  // Mark route output so the terminal test can check buffering and replay.
  console.log(`UPGRADE_TERMINAL_ROUTE_RENDERED TTY=${process.stdout.isTTY}`)
  return <p>hello world</p>
}
