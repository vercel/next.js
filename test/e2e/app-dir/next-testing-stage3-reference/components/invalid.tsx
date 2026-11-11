import { Counter } from './counter'

export default function Invalid() {
  return <Counter initial={(() => 10) as unknown as number} />
}
