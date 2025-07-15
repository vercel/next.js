import { setTimeout } from 'timers/promises'

async function cachedDelay() {
  'use cache'
  await setTimeout(3000)
}

export default async function Page() {
  // Defer rendering to ensure the prerender order is deterministic, i.e. the
  // client page will be finished prerendering first.
  await cachedDelay()

  return <p>Random: {Math.random()}</p>
}
