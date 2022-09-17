import { useRouter, withRouter } from 'next/router'
import IsNull from './is-null'
import ServerRouter from './server-router'
import ClientRouter from './client-router'

function SharedRouter({ router: withRouter }) {
  const router = useRouter()

  return (
    <>
      <IsNull value={withRouter} />
      <IsNull value={router} />
      <ServerRouter />
      <ClientRouter />
    </>
  )
}

export default withRouter(SharedRouter)
