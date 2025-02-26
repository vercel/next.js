const page = () => 'page with err'
page.getInitialProps = () => {
  throw new Error('gip-oops')
}
export default page
