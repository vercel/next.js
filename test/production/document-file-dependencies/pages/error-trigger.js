function ErrorTrigger() {
  return <div>error-trigger</div>
}

ErrorTrigger.getInitialProps = () => {
  throw new Error('Intentional Error')

  // eslint-disable-next-line no-unreachable
  return {}
}

export default ErrorTrigger
