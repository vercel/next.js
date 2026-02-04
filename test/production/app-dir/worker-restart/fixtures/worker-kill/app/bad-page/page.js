export default function Page() {
  process.kill(process.pid, 'SIGKILL')

  return <div>Kaboom</div>
}
