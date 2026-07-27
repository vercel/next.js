import { useRouter } from 'next/router'

export default function Page(props) {
  // eslint-disable-next-line
  const router = useRouter()

  // console.log(router.isReady)

  return (
    <>
      <p id="invalid">invalid page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
