import { setTimeout } from 'timers/promises'

export default async function SlowPage() {
  await setTimeout(2000)

  return <p>Hello, Dave!</p>
}
