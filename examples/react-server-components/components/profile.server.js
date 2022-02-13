import { fetch } from 'react-fetch'

export default function Profile() {
  const repo = fetch('https://api.github.com/repos/vercel/next.js').json()

  return (
    <p>
      <strong>Next.js: </strong>
      <span>{repo.stars}</span>
    </p>
  )
}
