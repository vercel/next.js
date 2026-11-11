import { AsyncClient } from '../async-client'
import { PlainClient } from '../plain-client'

export default function Page() {
  return (
    <>
      <h1 id="page">b</h1>
      <AsyncClient />
      <PlainClient />
    </>
  )
}
