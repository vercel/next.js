import { useRouter } from 'next/router'

const Page = () => {
  const { query } = useRouter()
  return <p>{JSON.stringify(query)}</p>
}

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
