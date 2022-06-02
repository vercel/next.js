import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="slug">blog slug {router.query.slug}</p>
    </>
  )
}
