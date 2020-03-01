import { useRouter } from 'next/router'

export default () => {
  const { query } = useRouter()

  return <p>post: {query.post}</p>
}
