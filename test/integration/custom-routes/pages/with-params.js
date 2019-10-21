import { useRouter } from 'next/router'
const Page = () => (
  <>
    <p>Params: {JSON.stringify(useRouter().query)}</p>
  </>
)

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
