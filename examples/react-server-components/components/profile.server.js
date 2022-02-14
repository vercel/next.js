import { useData } from '../lib/use-data'

export default function Profile() {
  const repo = useData('/api/repo', (key) => fetch(key).then((r) => r.json()))
  return (
    <p>
      <strong>Next.js: </strong>
      <span>{repo.stars}</span>
    </p>
  )
}
