import { Probe } from './probe'

export const dynamic = 'force-dynamic'

export default function Page() {
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
