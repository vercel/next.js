import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <h1 id="something-else-page">something else</h1>
      <button id="go-back" onClick={() => router.back()}>
        back
      </button>
    </>
  )
}
