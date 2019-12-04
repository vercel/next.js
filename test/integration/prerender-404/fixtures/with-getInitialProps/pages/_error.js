const Error = ({ message }) => {
  return <p>{message}</p>
}

Error.getInitialProps = () => {
  return { message: 'custom props' }
}

export default Error
