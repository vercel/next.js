const Error = ({ message }) => {
  return <p id="error-p">Error Rendered with: {message}</p>
}

Error.getInitialProps = ({ err }) => {
  return {
    message: err.message,
  }
}

export default Error
