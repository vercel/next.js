const Page = () => 'oops'

Page.getInitialProps = () => {
  throw new Error('oops')
}

export default Page
