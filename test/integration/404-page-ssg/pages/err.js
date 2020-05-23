const page = () => 'err page'
page.getInitialProps = () => {
  throw new Error('oops')
}
export default page
