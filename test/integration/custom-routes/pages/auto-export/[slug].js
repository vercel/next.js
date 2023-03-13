import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <p id="auto-export">auto-export {router.query.slug}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}
