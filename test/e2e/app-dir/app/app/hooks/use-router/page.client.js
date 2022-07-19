import { useRouter } from 'next/dist/client/components/hooks-client'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <h1 id="router">hello from /hooks/use-router</h1>
      <button
        id="button-push"
        onClick={() => router.push('/hooks/use-router/sub-page')}
      >
        Router Push
      </button>
    </>
  )
}
