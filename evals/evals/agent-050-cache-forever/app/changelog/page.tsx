import { getChangelog } from '../../lib/changelog'

export default async function ChangelogPage() {
  const entries = await getChangelog()
  return (
    <main>
      <h1>Changelog</h1>
      <ul>
        {entries.map((e) => (
          <li key={e.version}>
            <strong>{e.version}</strong> — {e.notes}
          </li>
        ))}
      </ul>
    </main>
  )
}
