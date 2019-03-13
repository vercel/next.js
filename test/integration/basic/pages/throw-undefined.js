export default function ThrowUndefined (props) {
  return (
    <div>throw-undefined</div>
  )
}

ThrowUndefined.getInitialProps = () => {
  throw undefined
}
