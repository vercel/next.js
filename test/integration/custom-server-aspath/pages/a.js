import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { asPath } = router
  return <p>Hello {asPath}</p>
}

export default Page
