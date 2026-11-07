import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  function handlePush() {
    router.push({
      query: {
        id: 'b',
      },
    })
  }

  return (
    <>
      <p>{router.query.id}</p>
      <button id="router-push" onClick={handlePush}>
        router.push
      </button>
      <Link href="?id=c">Link</Link>
    </>
  )
}
