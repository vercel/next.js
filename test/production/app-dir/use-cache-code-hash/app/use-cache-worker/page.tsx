export default async function Page() {
  'use cache'

  if (Date.now() < 0) {
    // Include the worker in the cache scope without executing it on the server.
    new Worker(new URL('./worker.ts', import.meta.url))
  }

  return <p>worker</p>
}
