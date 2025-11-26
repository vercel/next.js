import { setTimeout } from 'timers/promises'

async function abstraction(timeoutMS: number) {
  await setTimeout(timeoutMS)
}

export default async function SetTimeoutPage() {
  await abstraction(5)
  await setTimeout(1000)

  return <p>Done</p>
}
