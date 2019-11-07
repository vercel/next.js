import { useRouter } from 'next/router'
const Page = () => (
  <>
    <p>slug: {useRouter().query.slug}</p>
  </>
)

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
