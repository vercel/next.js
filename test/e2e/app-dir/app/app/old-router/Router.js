import { useRouter, withRouter } from 'next/router'
import IsNull from './IsNull'
import ServerRouter from './Router.server'
import ClientRouter from './Router.client'

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
