import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return <p id={query.name}>This is {query.name}</p>
}

Page.getInitialProps = () => ({})

export default Page
