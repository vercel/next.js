export default function Page() {
  // Mark route output so the terminal test can check buffering and replay.
  console.log(`UPGRADE_TERMINAL_ROUTE_RENDERED TTY=${process.stdout.isTTY}`)
  // Expose the serving worker PID so the test can simulate an abrupt exit.
  return <p data-worker-pid={process.pid}>hello world</p>
}
