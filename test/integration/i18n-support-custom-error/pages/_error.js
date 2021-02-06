function CustomError({ statusCode }) {
  return statusCode === 410 ? (
    <div>410 - Gone page</div>
  ) : (
    <div>Other error (404, etc..)</div>
  )
}

CustomError.getInitialProps = ({ res, err, ...context }) => {
  // 410 - GONE
  if (context.asPath === '/my-custom-path-3') {
    res.statusCode = 410
  }

  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default CustomError
