import { useData } from '../lib/use-data'

const url = `https://api.github.com/repos/vercel/next.js`

export default function Profile() {
  const data = useData('star', () => fetch(url).then((r) => r.json()))

  return (
    <p>
      <strong>Next.js: </strong>
      <span>{data['stargazers_count']}</span>
    </p>
  )
}
