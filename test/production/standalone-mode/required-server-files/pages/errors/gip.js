function Page(props) {
  return <p>here comes an error</p>
}

Page.getInitialProps = ({ query }) => {
  if (query.crash) {
    throw new Error('gip hit an oops')
  }
  return {
    hello: 'world',
  }
}

export default Page
