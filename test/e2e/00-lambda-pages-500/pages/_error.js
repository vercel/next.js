function Error(props) {
  return (
    <>
      <p>pages/_error</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

Error.getInitialProps = async function getInitialProps({ statusCode, err }) {
  console.log('Error.getInitialProps', err)
  return {
    statusCode,
    message: err?.message,
  }
}

export default Error
