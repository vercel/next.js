import { connection } from 'next/server'
import { Probe } from './probe'

export default async function Page() {
  await connection()
  return (
    <main>
      <p id="rendered-at">{Date.now()}</p>
      <Probe>
        <div className="hero">
          <h2>Welcome</h2>
          <p>Static content</p>
        </div>
      </Probe>
    </main>
  )
}
