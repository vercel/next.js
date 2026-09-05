import { CsvCruncher } from './components/csv-cruncher'

const REGIONS = [
  { name: 'us-east', deploys: 42, incidents: 1 },
  { name: 'eu-west', deploys: 37, incidents: 0 },
  { name: 'ap-south', deploys: 29, incidents: 2 },
]

export default function DashboardPage() {
  return (
    <main>
      <h1>Acme Ops Dashboard</h1>
      <section>
        <h2>Regions</h2>
        <ul>
          {REGIONS.map((r) => (
            <li key={r.name}>
              {r.name}: {r.deploys} deploys, {r.incidents} incidents
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Latency report</h2>
        <CsvCruncher />
      </section>
    </main>
  )
}
