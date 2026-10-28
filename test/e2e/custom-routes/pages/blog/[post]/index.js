import { useRouter } from 'next/router'

const Page = () => {
  const { query } = useRouter()
  return (
    <>
      <p>post: {query.post}</p>
      <div id="query">{JSON.stringify(query)}</div>
    </>
  )
}

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
