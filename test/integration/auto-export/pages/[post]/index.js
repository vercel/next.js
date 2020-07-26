import { useRouter } from 'next/router'

export default function Page() {
  const { query } = useRouter()

  return <p>post: {query.post}</p>
}
