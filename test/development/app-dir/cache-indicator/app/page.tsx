import { setTimeout } from 'timers/promises'

async function triggerSlowCacheFilling() {
  'use cache'
  await setTimeout(1000)
}

export default async function Page() {
  await triggerSlowCacheFilling()
  return <p>Hello, initial load!</p>
}
