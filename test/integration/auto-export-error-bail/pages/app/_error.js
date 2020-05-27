import Error from 'next/Error'

function MyError(props) {
  return <Error {...props} />
}

MyError.getInitialProps = async (ctx) => {
  return Error.getInitialProps(ctx)
}

export default MyError
