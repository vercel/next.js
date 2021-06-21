import useServerContext from 'next-server-context/public/useServerContext.js'
import ErrorMessage from './ErrorMessage'

export default function ErrorLoading() {
  const serverContext = useServerContext()

  if (serverContext) serverContext.response.statusCode = 500

  return <ErrorMessage title="Error loading" description="Unable to load." />
}
