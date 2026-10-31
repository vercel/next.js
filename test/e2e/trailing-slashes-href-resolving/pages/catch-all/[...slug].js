import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="slug">catch-all slug {router.query.slug?.join('/')}</p>
    </>
  )
}
