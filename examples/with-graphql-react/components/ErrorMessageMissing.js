import useServerContext from 'next-server-context/public/useServerContext.js'
import ErrorMessage from './ErrorMessage'

export default function ErrorMissing() {
  const serverContext = useServerContext()

  if (serverContext) serverContext.response.statusCode = 404

  return <ErrorMessage title="Error 404" description="Something is missing." />
}
