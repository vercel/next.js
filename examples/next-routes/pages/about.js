import { useRouter } from 'next/router'

const Page = () => {
  return <p>Query: {JSON.stringify(useRouter().query)}</p>
}

Page.getInitialProps = () => ({
  hello: 'world',
})

export default Page
