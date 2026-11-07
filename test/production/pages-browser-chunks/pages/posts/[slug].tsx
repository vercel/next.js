import { useRouter } from 'next/router'

export default function Post() {
  const { query } = useRouter()
  return <p id="slug">{query.slug}</p>
}
