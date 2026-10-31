const page = () => 'custom 404 page'
page.getInitialProps = () => {
  throw new Error('oops')
}
export default page
