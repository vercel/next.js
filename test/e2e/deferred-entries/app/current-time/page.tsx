export const dynamic = 'force-dynamic'

export default function CurrentTimePage() {
  return (
    <div>
      <h1>Current Time</h1>
      <p id="current-time">{Date.now()}</p>
    </div>
  )
}
