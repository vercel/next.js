import { connection } from 'next/server'

const marker = 'b-initial'

export default async function PageB() {
  await connection()

  return <p id="marker">{marker}</p>
}
