import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return <p>Show review for {query.name} here</p>
}

Page.getInitialProps = () => ({})

export default Page
