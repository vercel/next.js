import { action } from './async-module-with-actions'

export default async function Page() {
  return (
    <main>
      <h1>
        A page that uses a cached component whose result contains an async
        server reference
      </h1>
      <Cached />
    </main>
  )
}

async function Cached() {
  'use cache'
  // 'use cache' decodes and re-encodes RSC data on the server,
  // so it can break if async references are not resolved correctly.
  return (
    <form action={action}>
      <button type="submit">Submit</button>
    </form>
  )
}
