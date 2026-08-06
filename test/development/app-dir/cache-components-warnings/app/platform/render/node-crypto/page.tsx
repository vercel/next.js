import { randomInt } from 'node:crypto'

import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <dl>
      <dt>require('node:crypto').randomInt(20)</dt>
      <dd>{randomInt(20)}</dd>
      <dt>require('node:crypto').randomInt(20, 40)</dt>
      <dd>{randomInt(20, 40)}</dd>
    </dl>
  )
}
