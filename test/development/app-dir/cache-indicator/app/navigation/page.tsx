import { setTimeout } from 'timers/promises'

async function triggerSlowCacheFilling() {
  'use cache'
  await setTimeout(1000)
}

export default async function NavigationPage() {
  await triggerSlowCacheFilling()
  return <p>Hello, navigation!</p>
}
