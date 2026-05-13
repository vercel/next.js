function CustomError(props) {
  return (
    <>
      <div>My Custom {props.statusCode} page</div>
      <div id="error-props">{JSON.stringify(props)}</div>
    </>
  )
}

CustomError.getInitialProps = ({ res, err, ...context }) => {
  // 410 - GONE
  if (res && context.asPath === '/my-custom-gone-path') {
    res.statusCode = 410
  }

  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode, locale: context.locale }
}

export default CustomError
