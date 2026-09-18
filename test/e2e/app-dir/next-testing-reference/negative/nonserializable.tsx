import { Counter } from '../app/reference/counter'

export default function Nonserializable() {
  // A function is not a serializable number. Preserve the runtime failure.
  return <Counter initial={(() => 10) as unknown as number} />
}
