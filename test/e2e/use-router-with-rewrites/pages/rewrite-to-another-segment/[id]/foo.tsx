import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  function handlePush() {
    router.push({
      query: {
        id: 1,
      },
    })
  }

  function handleReplace() {
    router.replace({
      query: {
        id: 2,
      },
    })
  }

  return (
    <>
      <p>{router.query.id}</p>
      <button id="router-push" onClick={handlePush}>
        router.push
      </button>
      <button id="router-replace" onClick={handleReplace}>
        router.replace
      </button>
      <Link href="?id=3">Link</Link>
    </>
  )
}
