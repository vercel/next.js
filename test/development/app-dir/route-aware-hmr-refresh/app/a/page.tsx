import { connection } from 'next/server'

const marker = 'a-initial'

export default async function PageA() {
  await connection()

  return <p id="marker">{marker}</p>
}
