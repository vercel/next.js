import { useRouter } from 'next/router'

const Page = () => <div id="query">{JSON.stringify(useRouter().query)}</div>

Page.getInitialProps = () => ({ hello: 'world' })

export default Page
