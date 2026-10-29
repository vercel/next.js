import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <>
      <p id="children">children</p>
      <p id="render">{randomUUID()}</p>
    </>
  )
}
