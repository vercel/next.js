import { randomInt } from 'node:crypto'

export default async function Page() {
  return (
    <dl>
      <dt>require('node:crypto').randomInt(20)</dt>
      <dd>{randomInt(20)}</dd>
      <dt>require('node:crypto').randomInt(20, 40)</dt>
      <dd>{randomInt(20, 40)}</dd>
    </dl>
  )
}
