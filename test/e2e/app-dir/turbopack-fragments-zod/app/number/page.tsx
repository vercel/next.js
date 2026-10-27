import { number } from 'zod'

export default function Page() {
  return <p>{number().int().positive().parse(42)}</p>
}
