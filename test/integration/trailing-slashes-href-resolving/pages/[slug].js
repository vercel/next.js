import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="slug">top level slug {router.query.slug}</p>
    </>
  )
}
