import { useRouter } from 'next/router'

const Page = () => {
  const { query } = useRouter()
  return <p>{JSON.stringify(query)}</p>
}

Page.getInitialProps = () => ({ a: 'b' })

export default Page
