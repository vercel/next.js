import { useRouter } from 'next/router'

const Page = () => {
  return <p>Hello {useRouter().asPath}</p>
}

Page.getInitialProps = () => ({})

export default Page
