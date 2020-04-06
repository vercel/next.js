const Page = () => 'hi'

Page.getInitialProps = () => {
  const error = new Error('to 404 we go')
  error.code = 'ENOENT'
  throw error
}

export default Page
