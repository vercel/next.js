import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  if (typeof window !== 'undefined') {
    if (!window.isReadyValues) {
      window.isReadyValues = []
    }
    window.isReadyValues.push(router.isReady)
  }

  return (
    <>
      <p id="auto-export">auto-export page</p>
    </>
  )
}
