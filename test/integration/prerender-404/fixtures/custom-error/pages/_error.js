const Error = ({ statusCode }) => {
  if (statusCode === 404) {
    return <p>custom 404</p>
  }
  return null
}

export default Error
