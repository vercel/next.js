export function Timestamp() {
  const now = Math.floor(performance.timeOrigin + performance.now())
  return <div id="timestamp">{`Timestamp: ${now}`}</div>
}
