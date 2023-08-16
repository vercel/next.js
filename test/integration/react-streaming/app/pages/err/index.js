const page = () => 'page with err'
page.getInitialProps = () => {
  throw new Error('oops')
}
export default page
