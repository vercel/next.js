import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return (
    <div>
      <h1 id="result-page">Result Page</h1>
      <div id="timestamp">{Date.now()}</div>
    </div>
  )
}
