function ThrowUndefined(props) {
  return <div>throw-undefined</div>
}

ThrowUndefined.getInitialProps = () => {
  // eslint-disable-next-line no-throw-literal
  throw undefined
}

export default ThrowUndefined
