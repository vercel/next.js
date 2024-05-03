import test from '../lib/async-function'

function ReadOnlyObjectError() {
  return 'this is just a placeholder component'
}

ReadOnlyObjectError.getInitialProps = async () => {
  const result = await test()
  return { result }
}

export default ReadOnlyObjectError
