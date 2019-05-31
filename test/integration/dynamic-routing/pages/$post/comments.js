import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return <p>Show comments for {query.post} here</p>
}

Page.getInitialProps = () => ({})

export default Page
