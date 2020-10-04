import { useRouter } from 'next/router'

const Page = () => (
  <>
    <p>post: {useRouter().query.post}</p>
  </>
)

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
