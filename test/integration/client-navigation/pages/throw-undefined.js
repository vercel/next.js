function ThrowUndefined(props) {
  return <div>throw-undefined</div>
}

ThrowUndefined.getInitialProps = () => {
  throw undefined
}

export default ThrowUndefined
