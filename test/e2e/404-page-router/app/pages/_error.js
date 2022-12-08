import DebugError from '../components/debug-error'
import Debug from '../components/debug'

function Error({ statusCode }) {
  return <DebugError />
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
