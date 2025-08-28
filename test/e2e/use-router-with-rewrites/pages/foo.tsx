import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  function handlePush() {
    router.push({
      query: {
        param: 1,
      },
    })
  }

  function handleReplace() {
    router.replace({
      query: {
        param: 1,
      },
    })
  }

  return (
    <>
      <button id="router-push" onClick={handlePush}>
        router.push
      </button>
      <button id="router-replace" onClick={handleReplace}>
        router.replace
      </button>
      <Link href="?param=1">Link</Link>
    </>
  )
}
