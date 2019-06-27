import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return <p>This is {query.post}</p>
}

Page.getInitialProps = () => ({})

export default Page
