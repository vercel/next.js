import { trackPageview, telemetryTransport } from '../lib/telemetry'

const services = [
  { name: 'API', status: 'operational' },
  { name: 'Dashboard', status: 'operational' },
  { name: 'Webhooks', status: 'operational' },
]

export default function HomePage() {
  trackPageview('/')
  return (
    <main>
      <h1>Fastlane Status</h1>
      <ul>
        {services.map((s) => (
          <li key={s.name}>
            {s.name}: {s.status}
          </li>
        ))}
      </ul>
      <footer>
        <small data-testid="diagnostics">
          telemetry:{telemetryTransport()}
        </small>
      </footer>
    </main>
  )
}
