const label = 'count'
let count = 0
count += 1

export function Counter() {
  return (
    <span>
      <b>{label}</b>
      <i>{count}</i>
    </span>
  )
}
