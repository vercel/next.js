import { a, b, c, d, e } from '../components/client-exports'

export default function Page() {
  return (
    <div>
      {a}
      {b}
      {c}
      {d}
      {e[0]}
    </div>
  )
}
