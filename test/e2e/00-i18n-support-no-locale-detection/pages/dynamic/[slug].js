import { useRouter } from 'next/router'

export default function Dynamic(props) {
  const router = useRouter()

  return (
    <>
      <p>dynamic page</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}
